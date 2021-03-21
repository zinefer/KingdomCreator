<template>
  <div>
    <GridLayout
      :items="cards"
      :number-of-columns="numberOfColumns"
      :is-vertical="true"
      :class="{'kingdom-supply--is-enlarged': isEnlarged}"
      class="sortable-supply-cards"
    >
      <template v-slot:default="slotProps">
        <FlippingCard :card="slotProps.item" :is-vertical="true"
          @front-visible="handleSupplyCardFrontVisible"
          @flipping-to-back="handleSupplyCardFlippingToBack"
        >
        </FlippingCard>
      </template>
    </GridLayout>
  </div>
</template>

<script lang="ts">
import FlippingCard from "./FlippingCard.vue";
import GridLayout from "./GridLayout.vue";

import { Coordinate } from "../utils/coordinate";
import { SupplyCard } from "../dominion/supply-card";
import { SetId } from "../dominion/set-id";
import {Cost} from "../dominion/cost"
import { State } from "vuex-class";
import { Vue, Component, Watch, Prop } from "vue-property-decorator";
import { SortOption } from "../settings/settings";
import { SupplyCardSorter } from "../utils/supply-card-sorter";
import { TweenLite, Sine } from "gsap";
import { Selection } from "../stores/randomizer/selection";




interface MoveDescriptor {
  elementIndex: number;
  newVisualIndex: number;
}

const ANIMATION_DURATION_SEC = 0.6;
const WINDOW_RESIZE_DELAY_MSEC = 300;

@Component({
  components: {
    GridLayout,
    FlippingCard,
  }
})
export default class DraftSupply extends Vue {
  @State(state => state.window.width) readonly windowWidth!: number;
  @State(state => state.window.isEnlarged) readonly isEnlarged!: boolean;
  @State(state => state.randomizer.selection) readonly selection!: Selection; 
  
  elementIndexMapping = new Map<number, number>();
  @Prop() readonly supplyCards: SupplyCard[] = [];
  mappedSupplyCards: SupplyCard[] = [];
  numberOfSupplyCardsLoading = 0;
  requiresSupplyCardSort = false;
  activeAnimations: Set<TweenLite> = new Set();
  resizeTimerId: number | null = null;
  replacingCard: SupplyCard | null = null;

  mounted() {
    this.updateActiveSupplyCards();
  }

  get numberOfColumns() {
    return this.isEnlarged ? 2 : this.windowWidth > 450 ? 5 : 4
  }

  get cards() {
    const cards = this.supplyCards.concat();
    let len = cards.length;

    for (let i = 0; i < 10 - len; i++) {
      cards.push(new SupplyCard('none', 'none', SetId.BASE_SET, 'none', new Cost(0,0,0), false, false,false,false,false,false,false,false,false,false,false,false,false,false,false));
    }

    return cards;
  }

  @Watch("windowWidth")
  handleWindowWidthChanged() {
    this.cancelActiveAnimations();
    this.resetCardPositions();

    // Schedule a reset to happen again after the user finishes resizing the window to catch
    // any cases where the reset happened before the elements were fully positioned.
    if (this.resizeTimerId) {
      clearTimeout(this.resizeTimerId);
    }
    this.resizeTimerId = setTimeout(() => this.resetCardPositions(), WINDOW_RESIZE_DELAY_MSEC)
  }

  @Watch("numberOfColumns")
  handleNumberOfColumnsChanged() {
    this.$nextTick(() => this.resetCardPositions());
  }

  handleSupplyCardFlippingToBack(supplyCard: SupplyCard) {
    this.numberOfSupplyCardsLoading += 1;
  }

  handleSupplyCardFrontVisible(supplyCard: SupplyCard) {
    this.numberOfSupplyCardsLoading -= 1;
    this.attemptToAnimateSupplyCardSort();
  }

  handleReplace(supplyCard: SupplyCard) {
    this.replacingCard = supplyCard;
  }

  private updateActiveSupplyCards() {
    if (this.supplyCards.length == 0) {
      return;
    }
    
    // Remap the sorted supply cards to where the elements currently reside.
    const mappedSupplyCards = [];
    for (let i = 0; i < this.supplyCards.length; i++) {
      mappedSupplyCards[this.getElementIndex(i)] = this.supplyCards[i];
    }
    this.mappedSupplyCards = mappedSupplyCards;
  }

  private attemptToAnimateSupplyCardSort() {
    if (this.numberOfSupplyCardsLoading > 0 || !this.requiresSupplyCardSort) {
      return;
    }
    this.requiresSupplyCardSort = false;
    this.cancelActiveAnimations();
    this.animateSupplyCardSort();
  }

  private resetCardPositions() {
    for (let visualIndex = 0; visualIndex < this.supplyCards.length; visualIndex++) {
      const elementIndex = this.getElementIndex(visualIndex);
      const element = this.getSupplyCardElement(elementIndex);
      const startCoord = this.getPositionForElementIndex(elementIndex);
      const endCoord = this.getPositionForElementIndex(visualIndex);
      const x = endCoord.x - startCoord.x;
      const y = endCoord.y - startCoord.y;
      element.style.transform = `translate(${x}px,${y}px)`;
    }
  }

  private cancelActiveAnimations() {
    for (let animation of this.activeAnimations) {
      animation.kill();
    }
    this.activeAnimations.clear();
  }

  private animateSupplyCardSort() {
    const descriptors = this.createMoveDescriptors(this.supplyCards.concat());
    const newMapping: Map<number, number> = new Map();

    for (let descriptor of descriptors) {
      const element = this.getSupplyCardElement(descriptor.elementIndex);
      const startCoord = this.getPositionForElementIndex(descriptor.elementIndex);
      const endCoord = this.getPositionForElementIndex(descriptor.newVisualIndex);
      const x = endCoord.x - startCoord.x;
      const y = endCoord.y - startCoord.y;
      const tweenLite =
          TweenLite.to(element, ANIMATION_DURATION_SEC, {
            transform: `translate(${x}px,${y}px)`,
            ease: Sine.easeInOut,
            onComplete: () => this.activeAnimations.delete(tweenLite),
          });
      this.activeAnimations.add(tweenLite);
      newMapping.set(descriptor.newVisualIndex, descriptor.elementIndex);
    }
    this.elementIndexMapping = newMapping;
  }

  private createMoveDescriptors(sortedSupplyCards: SupplyCard[]) {
    const cardIds = sortedSupplyCards.map((card) => card.id);
    const descriptors: MoveDescriptor[] = [];
    for (let newVisualIndex = 0; newVisualIndex < sortedSupplyCards.length; newVisualIndex++) {
      descriptors.push({
        newVisualIndex: newVisualIndex,
        elementIndex: cardIds.indexOf(sortedSupplyCards[newVisualIndex].id),
      });
    }
    return descriptors;
  }

  private getPositionForElementIndex(index: number): Coordinate {
    const container = this.getSupplyCardContainers()[index];
    return {x: container.offsetLeft, y: container.offsetTop};
  }

  private getSupplyCardElement(index: number) {
    return this.getSupplyCardContainers()[index].firstChild! as HTMLElement;
  }

  private getSupplyCardContainers() {
    return this.$el.querySelectorAll(".grid-layout_item") as NodeListOf<HTMLElement>;
  }

  private getElementIndex(visualIndex: number) {
    return this.elementIndexMapping.has(visualIndex) 
        ? this.elementIndexMapping.get(visualIndex)!
        : visualIndex;
  }
}
</script>

<style>
.kingdom-supply--is-enlarged .card-set-description .card-description {
  font-size: 16px !important;
}
</style>

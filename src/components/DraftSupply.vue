<template>
  <div>
    <GridLayout
      :items="cards"
      :number-of-columns="numberOfColumns"
      :is-vertical="true"
      class="sortable-supply-cards"
      :class="{'kingdom-supply--is-enlarged': isEnlarged}"
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
import BaneCardCover from "./BaneCardCover.vue";
import { Coordinate } from "../utils/coordinate";
import { SupplyCard } from "../dominion/supply-card";
import { SetId } from "../dominion/set-id";
import {Cost} from "../dominion/cost"
import { State } from "vuex-class";
import { Vue, Component, Watch, Prop } from "vue-property-decorator";
import { SortOption } from "../settings/settings";
import { Kingdom } from "../randomizer/kingdom";
import { SupplyCardSorter } from "../utils/supply-card-sorter";
import { TweenLite, Sine } from "gsap";
import { Selection } from "../stores/randomizer/selection";
import { UPDATE_SPECIFYING_REPLACEMENT_SUPPLY_CARD } from "../stores/randomizer/mutation-types";
//import { UNSELECT_CARD } from "../stores/randomizer/action-types";
import GridLayout from "./GridLayout.vue";



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
    BaneCardCover,
  }
})
export default class DraftSupply extends Vue {
  //@State(state => state.randomizer.kingdom) readonly kingdom!: Kingdom;
  @State(state => state.randomizer.settings.sortOption) readonly sortOption!: SortOption;
  @State(state => state.window.width) readonly windowWidth!: number;
  @State(state => state.window.isEnlarged) readonly isEnlarged!: boolean;
  @State(state => state.randomizer.selection) readonly selection!: Selection;
  

  
  elementIndexMapping = new Map<number, number>();
  kingdomId: number = 0;
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

    console.log(cards.length);
    let len = cards.length;

    for (let i = 0; i < 10 - len; i++) {
      cards.push(new SupplyCard('none', 'none', SetId.BASE_SET, 'none', new Cost(0,0,0), false, false,false,false,false,false,false,false,false,false,false,false,false,false,false));
    }

    console.log(cards);

    return cards;
  }

  @Watch("kingdom")
  handleKingdomChanged() {
    this.updateActiveSupplyCards();
  }

  @Watch("sortOption")
  handleSortOptionChanged() {
    this.requiresSupplyCardSort = true;
    this.attemptToAnimateSupplyCardSort();
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

  handleSpecify(supplyCard: SupplyCard) {
    this.$store.commit(UPDATE_SPECIFYING_REPLACEMENT_SUPPLY_CARD, supplyCard);
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
    const sortedSupplyCards =
        SupplyCardSorter.sort(this.supplyCards.concat(), this.sortOption);
    
    // Remap the sorted supply cards to where the elements currently reside.
    const mappedSupplyCards = [];
    for (let i = 0; i < sortedSupplyCards.length; i++) {
      mappedSupplyCards[this.getElementIndex(i)] = sortedSupplyCards[i];
    }
    this.mappedSupplyCards = mappedSupplyCards;
  }

  private updateSupplyCards() {
    //this.requiresSupplyCardSort = true;
    //this.mappedSupplyCards = DraftSupply.replaceSupplyCards(
        //this.supplyCards, this.supplyCards);
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
    const sortedCards = SupplyCardSorter.sort(this.supplyCards.concat(), this.sortOption);
    const descriptors = this.createMoveDescriptors(sortedCards);
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
    const cardIds = this.supplyCards.map((card) => card.id);
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

  // private static replaceSupplyCards(oldSupplyCards: SupplyCard[], newSupplyCards: SupplyCard[]) {
  //   const supplyCards: SupplyCard[] = [];
  //   const supplyCardsToAdd = DraftSupply.getSupplyCardsToAdd(oldSupplyCards, newSupplyCards);
  //   const oldIds = DraftSupply.getOldIds(oldSupplyCards, newSupplyCards);
  //   let supplyCardsToAddIndex = 0;
  //   for (let i = 0; i < oldSupplyCards.length; i++) {
  //     const supplyCard = oldSupplyCards[i];
  //     if (oldIds.has(supplyCard.id)) {
  //       supplyCards.push(supplyCardsToAdd[supplyCardsToAddIndex]);
  //       supplyCardsToAddIndex += 1;
  //     } else {
  //       supplyCards.push(supplyCard);
  //     }
  //   }
  //   return supplyCards;
  // }

  private static getSupplyCardsToAdd(oldSupplyCards: SupplyCard[], newSupplyCards: SupplyCard[]) {
    const existingIds = new Set(oldSupplyCards.map((card) => card.id));
    return newSupplyCards.filter((card) => !existingIds.has(card.id));
  }

  private static getOldIds(oldSupplyCards: SupplyCard[], newSupplyCards: SupplyCard[]) {
    const newIds = new Set(newSupplyCards.map((card) => card.id));
    return new Set(oldSupplyCards.filter((card) => !newIds.has(card.id)).map((card) => card.id));
  }
}
</script>

<style>
.kingdom-supply--is-enlarged .card-set-description .card-description {
  font-size: 16px !important;
}
</style>

<template>
  <div>
    <GridLayout
      :items="getSupplyCards"
      :number-of-columns="numberOfColumns"
      :is-vertical="true"
    >
      <template v-slot:default="slotProps">
        <FlippingCard :card="slotProps.item" :is-vertical="true"
          @front-visible="handleSupplyCardFrontVisible"
          @flipping-to-back="handleSupplyCardFlippingToBack"
        >
          <template v-slot:highlight-content>
            <div 
              class="standard-button standard-button--is-primary standard-button--light-border"
              @click.stop="handleChoice(slotProps.item)"
            >
              Pick!
            </div>
          </template>
        </FlippingCard>
      </template>
    </GridLayout>
  </div>
</template>


<script lang="ts">
import { Component, Vue, Prop } from "vue-property-decorator";
import {SupplyCard} from "../dominion/supply-card";
import GridLayout from "./GridLayout.vue";
import { TweenLite, Sine } from "gsap";
import FlippingCard from "./FlippingCard.vue";
import { Coordinate } from "../utils/coordinate";
import { State } from "vuex-class";

interface MoveDescriptor {
  elementIndex: number;
  newVisualIndex: number;
}

@Component({
  components: {
    GridLayout,
    FlippingCard,
  }
})

export default class DraftingHand extends Vue {
    @State(state => state.window.width) readonly windowWidth!: number;
    @State(state => state.window.isEnlarged) readonly isEnlarged!: boolean;
    
    @Prop() readonly onCardClick!: Function;

    @Prop() readonly supplyCards!: SupplyCard[];
    
    get getSupplyCards() : SupplyCard[] {
        return this.supplyCards;
    }

    numberOfSupplyCardsLoading = 0;
    activeAnimations: Set<TweenLite> = new Set();

    elementIndexMapping = new Map<number, number>();

    ANIMATION_DURATION_SEC = -1;

    handleChoice(supplyCard: SupplyCard) {
      this.onCardClick(supplyCard);
    }

    handleSupplyCardFlippingToBack(supplyCard: SupplyCard) {
        this.numberOfSupplyCardsLoading += 1;
    }

    handleSupplyCardFrontVisible(supplyCard: SupplyCard) {
        this.numberOfSupplyCardsLoading -= 1;
        this.attemptToAnimateSupplyCardSort();
    }

    private attemptToAnimateSupplyCardSort() {
        if (this.numberOfSupplyCardsLoading > 0) {
            return;
        }
        this.cancelActiveAnimations();
        this.animateSupplyCardSort();
    }

    get numberOfColumns() {
        return this.isEnlarged ? 2 : this.windowWidth > 450 ? 5 : 4
    }

  private cancelActiveAnimations() {
    for (let animation of this.activeAnimations) {
      animation.kill();
    }
    this.activeAnimations.clear();
  }

  private animateSupplyCardSort() {
    const descriptors = this.createMoveDescriptors(this.getSupplyCards);
    const newMapping: Map<number, number> = new Map();

    for (let descriptor of descriptors) {
      const element = this.getSupplyCardElement(descriptor.elementIndex);
      const startCoord = this.getPositionForElementIndex(descriptor.elementIndex);
      const endCoord = this.getPositionForElementIndex(descriptor.newVisualIndex);
      const x = endCoord.x - startCoord.x;
      const y = endCoord.y - startCoord.y;
      const tweenLite =
          TweenLite.to(element, this.ANIMATION_DURATION_SEC, {
            transform: `translate(${x}px,${y}px)`,
            ease: Sine.easeInOut,
            onComplete: () => this.activeAnimations.delete(tweenLite),
          });
      this.activeAnimations.add(tweenLite);
      newMapping.set(descriptor.newVisualIndex, descriptor.elementIndex);
    }
    this.elementIndexMapping = newMapping;
  }

  private getSupplyCardElement(index: number) {
    return this.getSupplyCardContainers()[index].firstChild! as HTMLElement;
  }

  private getPositionForElementIndex(index: number): Coordinate {
    const container = this.getSupplyCardContainers()[index];
    return {x: container.offsetLeft, y: container.offsetTop};
  }

  private getSupplyCardContainers() {
    return this.$el.querySelectorAll(".grid-layout_item") as NodeListOf<HTMLElement>;
  }


  private createMoveDescriptors(sortedSupplyCards: SupplyCard[]) {
    const cardIds = this.getSupplyCards.map((card) => card.id);
    const descriptors: MoveDescriptor[] = [];
    for (let newVisualIndex = 0; newVisualIndex < sortedSupplyCards.length; newVisualIndex++) {
      descriptors.push({
        newVisualIndex: newVisualIndex,
        elementIndex: cardIds.indexOf(sortedSupplyCards[newVisualIndex].id),
      });
    }
    return descriptors;
  }
}
</script>
<template>
  <div>
    <GridLayout
      :items="getCards"
      :number-of-columns="numberOfColumns"
      :is-vertical="!addonHand"
    >
      <template v-slot:default="slotProps">
        <FlippingCard :card="slotProps.item" :is-vertical="!addonHand"
          @front-visible="handleCardFrontVisible"
          @flipping-to-back="handleCardFlippingToBack"
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
import { SupplyCard } from "../dominion/supply-card";
import { Card } from "../dominion/card";
import GridLayout from "./GridLayout.vue";
import { gsap, Sine } from "gsap";
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
    @Prop() readonly cards!: Card[];
    @Prop() readonly addonHand!: boolean;
    
    get getCards() : Card[] {
        return this.cards;
    }

    numberOfCardsLoading = 0;
    activeAnimations: Set<GSAPTween> = new Set();

    elementIndexMapping = new Map<number, number>();

    ANIMATION_DURATION_SEC = -1;

    handleChoice(card: Card) {
      console.log('draftinghand handleChoice', card)
      this.onCardClick(card as Card);
    }

    handleCardFlippingToBack(card: Card) {
        this.numberOfCardsLoading += 1;
    }

    handleCardFrontVisible(card: Card) {
        this.numberOfCardsLoading -= 1;
        this.attemptToAnimateCardSort();
    }

  private attemptToAnimateCardSort() {
      if (this.numberOfCardsLoading > 0) {
          return;
      }
      this.cancelActiveAnimations();
      this.animateCardSort();
  }

  get numberOfColumns() {
    if (this.addonHand) return this.numberOfAddonColumns;
    return this.isEnlarged ? 2 : this.windowWidth > 450 ? 5 : 4
  }

  get numberOfAddonColumns() {
    return this.isEnlarged ? 1 : this.windowWidth > 525 ? 3 : 2;
  }

  private cancelActiveAnimations() {
    for (let animation of this.activeAnimations) {
      animation.kill();
    }
    this.activeAnimations.clear();
  }

  private animateCardSort() {
    const descriptors = this.createMoveDescriptors(this.getCards);
    const newMapping: Map<number, number> = new Map();

    for (let descriptor of descriptors) {
      const element = this.getCardElement(descriptor.elementIndex);
      const startCoord = this.getPositionForElementIndex(descriptor.elementIndex);
      const endCoord = this.getPositionForElementIndex(descriptor.newVisualIndex);
      const x = endCoord.x - startCoord.x;
      const y = endCoord.y - startCoord.y;
      const tween: GSAPTween =
          gsap.to(element, this.ANIMATION_DURATION_SEC, {
            transform: `translate(${x}px,${y}px)`,
            ease: Sine.easeInOut,
            onComplete: () => { this.activeAnimations.delete(tween) },
          });
      this.activeAnimations.add(tween);
      newMapping.set(descriptor.newVisualIndex, descriptor.elementIndex);
    }
    this.elementIndexMapping = newMapping;
  }

  private getCardElement(index: number) {
    return this.getCardContainers()[index].firstChild! as HTMLElement;
  }

  private getPositionForElementIndex(index: number): Coordinate {
    const container = this.getCardContainers()[index];
    return {x: container.offsetLeft, y: container.offsetTop};
  }

  private getCardContainers() {
    return this.$el.querySelectorAll(".grid-layout_item") as NodeListOf<HTMLElement>;
  }

  private createMoveDescriptors(sortedCards: Card[]) {
    const cardIds = this.getCards.map((card) => card.id);
    const descriptors: MoveDescriptor[] = [];
    for (let newVisualIndex = 0; newVisualIndex < sortedCards.length; newVisualIndex++) {
      descriptors.push({
        newVisualIndex: newVisualIndex,
        elementIndex: cardIds.indexOf(sortedCards[newVisualIndex].id),
      });
    }
    return descriptors;
  }
}
</script>
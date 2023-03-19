import { EventEmitter } from "events"

import {Addon} from "../dominion/addon";

import {Card} from "../dominion/card";
import {SupplyCard} from "../dominion/supply-card";

import { Settings } from "../settings/settings";

import { Randomizer } from "../randomizer/randomizer";
import { RandomizerOptionsBuilder } from "../randomizer/randomizer-options";
import { selectRandom } from "../utils/rand";

import {DominionSets} from "../dominion/dominion-sets"

export class Draft extends EventEmitter {
    private settings: Settings;

    private currentHandType: String | null = null;
    private currentHand: Card[] = [];

    private kingdom: SupplyCard[] = [];
    private addons: Addon[] = [];
    private wantedAddons = 0;

    constructor(settings:Settings) {
        super();

        this.settings = settings;
    }

    async start(): Promise<void> {
        this.emit('started');

        this.kingdom = [];
        this.addons = [];
        this.currentHand = [];

        //build out a randomizer
        var rand = new RandomizerOptionsBuilder()
                        .setSetIds(this.settings.selectedSets);

        //await new Promise(r => setTimeout(r, 2000));

        let allAddons = Randomizer.getAddonsFromSets(rand.setIds, []);
        this.wantedAddons = Math.min(
            allAddons.length, selectRandom([ 0, 0, 1, 1, 2, 2, 2, 2, 3, 4 ])
        );

        let allSupplyCards = Randomizer.getAllSupplyCardsInSets(rand.build());

        let desiredCardsPerHand  = 5;
        let desiredCardsPerAddonHand = 3;

        let possibleCardsPerHand = ~~(allSupplyCards.length / 10);

        for (let i = 0; i < 10; i++) {
            let cardsPerHand = Math.min(desiredCardsPerHand, possibleCardsPerHand, allSupplyCards.length);

            let hand: Card[] = this.currentHand = [];

            if (cardsPerHand == 0) break;

            for (let h = 0; h < cardsPerHand; h++) {
                let index = ~~(Math.random() * allSupplyCards.length);
                let card = allSupplyCards[index] as Card;
                this.currentHand.push(card);
                allSupplyCards.splice(index, 1);
            }

            const choice = await this.getPlayerChoice('supply', hand);
            this.emit('supply', choice);

            const card = DominionSets.getSupplyCardById(choice);
            this.kingdom.push(card);
        }

        if (this.wantedAddons) {
            let addonDraftComplete = false;
            let vetoableDraftedAddon = null;

            do {
                if (vetoableDraftedAddon) {
                    const addonAudited = await this.getPlayerAudit();
                    if (addonAudited == false) {
                        this.emit('vetoed');
                        this.addons.pop();
                    } else {
                        addonDraftComplete = (this.addons.length == this.wantedAddons);
                        vetoableDraftedAddon = null;
                        continue;
                    }
                }

                let cardsPerAddonHand  = Math.min(
                    desiredCardsPerAddonHand, allAddons.length
                )

                if (cardsPerAddonHand == 0) {
                    addonDraftComplete = true;
                    continue;
                }

                let hand: Card[] = this.currentHand = [];

                for (let h = 0; h < cardsPerAddonHand; h++) {
                    let index = ~~(Math.random() * allAddons.length);
                    let card = allAddons[index];
                    hand.push(card);
                    allAddons.splice(index, 1);
                }

                const choice = await this.getPlayerChoice('addon', hand);
                this.emit('addon', choice);

                const card = DominionSets.getCardById(choice);
                this.addons.push(card as Addon);

                vetoableDraftedAddon = card;
            } while (!addonDraftComplete);
        }

        this.emit('complete');
    }

    getCurrentHand() {
        return {
            type: this.currentHandType,
            cards: this.cardsToIds(this.currentHand)
        }
    }

    getWantedAddons() {
        return this.wantedAddons;
    }

    setSettings(settings:Settings) {
        this.settings = settings;
    }

    private cardsToIds(cards:Card[]) {
        console.log(cards);
        return cards.map((card) => card.id).sort();
    }

    private async getPlayerChoice(type: string, hand:Array<Card>) : Promise<string> {
        let handIds = this.cardsToIds(hand);
        this.currentHandType = type;
        const promise = new Promise<string>((resolve, reject) => {
            this.emit('choose', {
                type: type,
                cards: handIds
            }, resolve);
        });
        return await promise;
    }

    private async getPlayerAudit() : Promise<boolean> {
        const promise = new Promise<boolean>((resolve, reject) => {
            this.emit('audit', resolve);
        });
        return await promise;
    }

}
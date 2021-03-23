import events from "events"

import {SupplyCard} from "../dominion/supply-card";
//import {Player} from "./player"

import { Settings } from "../settings/settings";
import {Supply} from "../randomizer/supply";

import { Randomizer } from "../randomizer/randomizer";
import { RandomizerOptionsBuilder } from "../randomizer/randomizer-options";

import {DominionSets} from "../dominion/dominion-sets"

export class Draft extends events.EventEmitter {
    started: boolean = false

    private currentPlayerIndex = 0;

    private settings: Settings;
    private players: string[] = []
    
    private seenCards: SupplyCard[] = []
    private kingdom: SupplyCard[] = []

    constructor(host:string, settings:Settings) {
        super();

        this.settings = settings;
        this.players.push(host);
    }

    join(name: string): void {
        if (this.players.length == 6) {
            throw new Error('Draft is full');
        }

        if (this.started) {
            throw new Error("Draft has started");
        }

        if (this.players.indexOf(name) > -1) {
            throw new Error("User already in draft");
        }

        this.players.push(name);
        this.emit('joined', name);
    }

    leave(name: string): void {
        let index = this.players.indexOf(name);
        if (index > -1) {
            this.players.splice(index, 1);
        }
        this.emit('left', name);
    }

    async start(): Promise<void> {
        this.started = true;
        this.emit('started');

        //build out a randomizer
        var rand = new RandomizerOptionsBuilder()
                        .setSetIds(this.settings.selectedSets);

        //await new Promise(r => setTimeout(r, 2000));

        let allCards = Randomizer.getAllSupplyCardsInSets(rand.build())
        let cardsPerHand = ~~(allCards.length / 10);

        if (cardsPerHand > 5) cardsPerHand = 5;
        
        for (let i = 0; i < 10; i++) {
            let hand:SupplyCard[] = [];
            
            for (let h = 0; h < cardsPerHand; h++) {
                let index = ~~(Math.random() * allCards.length);
                let card = allCards[index];
                hand.push(card);
                allCards.splice(index, 1);
            }
            
            this.seenCards = this.seenCards.concat(hand);

            const player = this.currentPlayer();
            const choice = await this.getPlayerChoice(player, hand);
            this.emit('choice', player, choice);
            const card = DominionSets.getSupplyCardById(choice);
            this.kingdom.push(card);
            this.nextPlayer();
        }
    }

    getPlayers(): string[] {
        return this.players.concat();
    }

    setSettings(settings:Settings) {
        this.settings = settings;
    }

    private cardsToIds(cards:SupplyCard[]) {
        console.log(cards);
        return cards.map((card) => card.id).sort();
    }

    private async getPlayerChoice(player:string, hand:Array<SupplyCard>) : Promise<string> {
        let handIds = this.cardsToIds(hand);
        const promise = new Promise<string>((resolve, reject) => {
            this.emit('choose', player, handIds, resolve);
        });

        return await promise;
    }

    private nextPlayer(): void {
        this.currentPlayerIndex = 
            (this.currentPlayerIndex + 1) % this.players.length;
    }

    private currentPlayer(): string {
        return this.players[this.currentPlayerIndex];
    }

}
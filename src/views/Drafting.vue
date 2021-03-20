<template>
  <div>
    <Page :subtitle="$t('index_page_subtitle')" :selectedType="selectedType">
      <div class="content">
        <RandomizerSidebar v-if="!connected || hosting" />
        
        
        
        <div class="main">
          <DraftSupply :supplyCards="draftSupply" />

          <hr/>

          <DraftingHand :supplyCards="draftHand" v-if="started" :onCardClick="handleClick" />

          <div class="options">
            <div>
              <div v-if="!connected">
                <input v-model="draftPlayerName" placeholder="player name" v-if="!connected">
                <button @click="hostDraft"  type="button" v-if="draftHostId == ''">Host Draft</button>
              </div>
              <div v-if="hosting">
                <span>{{ getDraftHostId }}</span>
                <h3>Players</h3>
                <ul>
                  <li v-for="player in players" :key="player.name">
                    {{ player.name }}
                  </li>
                </ul>
              </div>
              <button @click="startDraft"  type="button" v-if="hosting && connected && !started">Start Draft</button>
            </div>
            <div v-if="!connected">
              <h1>or</h1>
            </div>
            <div v-if="!connected">
              <input v-model="draftPlayerName" placeholder="player name">
              <input v-model="draftHostId" placeholder="host id">
              <button @click="joinDraft"  type="button" >Join Draft</button>
            </div>
            <h1 v-if="started">Started</h1>
          </div>
        </div>



        <div class="clearfix"></div>
      </div>
    </Page>
    <EnlargeButton />
  </div>
</template>

<script lang="ts">
import { Component } from "vue-property-decorator";
import Base from "./base";
import EnlargeButton from "../components/EnlargeButton.vue";
import Page, { MenuItemType } from "../components/Page.vue";
import RandomizerSidebar from "../components/RandomizerSidebar.vue";
import DraftingHand from "../components/DraftingHand.vue";
import DraftSupply from "../components/DraftSupply.vue";


import { State } from "vuex-class";

import { Settings } from "../settings/settings";

//import { RandomizerOptions, RandomizerOptionsBuilder } from "../randomizer/randomizer-options";
import { Kingdom, Metadata } from "../randomizer/kingdom";
import { UNSELECT_CARD } from "../stores/randomizer/action-types";

//import { SupplyBan } from "../randomizer/supply-ban";
import {SupplyCard} from "../dominion/supply-card";

import Peer from 'peerjs'

import { Draft } from "../drafting/draft";
import {Player} from "../drafting/player"

import {DominionSets} from "../dominion/dominion-sets"
import { Supply, Replacements } from "../randomizer/supply";

@Component({
  components: {
    Page,
    RandomizerSidebar,
    EnlargeButton,
    DraftingHand,
    DraftSupply
  },
})

export default class Drafting extends Base {
  selectedType = MenuItemType.DRAFT;
  draftHostId = '';
  draftPlayerName = '';
  draft!: Draft;
  connected = false;
  hosting = false;
  started = false;

  peerConnection!: Peer.DataConnection;

  draftHand: SupplyCard[] = [];

  draftSupply: SupplyCard[] = [];

  players: Player[] = [];

  seenCards!: SupplyCard[];

  waitingChoiceCallback!: Function;

  @State(state => state.randomizer.settings) readonly settings!: Settings;
  @State(state => state.randomizer.selection) readonly selection!: Selection;

  peer = new Peer({});

  get getDraftHostId() {
    return this.draftHostId;
  }

  hostDraft() {
    this.peer = new Peer({});

    let host = new Player(this.draftPlayerName);
    this.players.push(host);

    this.peer.on('error', (data) => {
        console.log('error ' + data);
      });

    this.peer.on('open', (id) => {
      console.log(id);
      this.draftHostId = id;
      this.connected = true;
      this.hosting = true;

      this.draft = new Draft(this.draftPlayerName, this.settings);
      this.draftHostHandlers();
    });

    this.peer.on('connection', (conn) => {

      conn.on('data', (msg) => {
        console.log(msg);
        
        switch (msg.type) {
          case 'join':
            try {
              var player = new Player(msg.data.name);
              player.connection = conn;
              
              this.draft.join(player.name);
              
              this.players.push(player);

              this.players.forEach(alreadyPlayer => {
                if (alreadyPlayer.name !== player.name && this.draftPlayerName !== player.name) {
                  conn.send({
                    type: 'joined',
                    data: {
                      player: player.name
                    }
                  });
                }
              });

              conn.send({
                type: 'hostinfo',
                data: {
                  player: this.draftPlayerName
                }
              });
            } catch (error) {
              console.log(error);
            }
          break;

          case 'choice':
            this.waitingChoiceCallback(msg.data.choice);        
          break;

          default:
            console.log('Error');
            console.log(JSON.stringify(msg));
          break;
        }
      });

      conn.on('error', (data) => {
        console.log(data);
      });
    });
  }

  startDraft() {
    this.sendToAll({type: 'start'});
    this.draft.start();
    this.draftStarted();
  }

  private draftStarted() {
    this.started = true;
    this.draftSupply = []
    //this.$store.commit(UPDATE_KINGDOM, this.draftKingdom);
  }

  handleClick(card:SupplyCard) {
    this.$store.dispatch(UNSELECT_CARD, card.id);
    
    if (this.hosting) {
      this.waitingChoiceCallback(card.id);
    } else {
      this.peerConnection.send({
        type: 'choice',
        data: {
          player: this.draftPlayerName,
          choice: card.id
        }
      });
    }

    this.draftHand = [];
  }

  private sendToAll(msg:any) {
    this.players.forEach(player => {
      console.log('send to ' + player.name);
      if (player.name == this.draftPlayerName) return;
      player.connection.send(msg);
    });
  }

  private draftHostHandlers() {
    this.draft.on('choose', (player, hand, callback) => {
        this.waitingChoiceCallback = callback;
        // send hand to player  

        if (player === this.draftPlayerName) {
          this.addCardIdsToDraftHand(hand);
        } else {
          let playerobj = this.getPlayerByName(player);
          playerobj!.connection.send({
            type: 'choose', 
            data: hand
          });
        }
    }).on('joined', (player) => {
      this.sendToAll({
        type: 'joined',
        data: {
          player: player
        }
      });
    }).on('choice', (player, choice) => {
      this.addChoiceToKingdom(player, choice);
      this.sendToAll({
        type: 'choice', 
        data: {
          player: player,
          choice: choice
        }
      });
    });

  }

  private addChoiceToKingdom(player:string, cardId:string) {
    let cards = this.draftSupply.concat();

    //console.log(cards);

    cards.push(DominionSets.getSupplyCardById(cardId))

    this.draftSupply = cards;

    //console.log(this.draftSupply);
  }
  
  private getPlayerByName(name:string) {
    return this.players.find(i => i.name === name);
  }

  private addCardIdsToDraftHand(cards:string[]) {
    cards.forEach((cardId:string) => {
      this.draftHand.push(DominionSets.getSupplyCardById(cardId));
    });
  }

  joinDraft() {

    this.peer.on('error', (data) => {
      console.log('error ' + data);
    });

    const conn = this.peer.connect(this.draftHostId);

    conn.on('open', () => {
      console.log('connection open');
      this.peerConnection = conn;
      this.connected = true;

      let player = new Player(this.draftPlayerName);
      this.players.push(player);

      conn.send({
        type:'join', 
        data: {
          name: this.draftPlayerName
        }
      });
      
    });

    conn.on('data', (msg) => {
      
      switch (msg.type) {
        case 'hostinfo':
          var player = new Player(msg.data.player);
          this.players = [player, ...this.players];
        break;

        case 'joined':
          var player = new Player(msg.data.player);
          this.players.push(player);
        break;

        case 'start':
          this.draftStarted();
        break;

        case 'choose': 
          this.addCardIdsToDraftHand(msg.data);
        break;

        case 'choice':
          this.addChoiceToKingdom(msg.data.player, msg.data.choice);
        break;
      
        default:
          console.log('Error');
          console.log(msg);
        break;
      }

    });

    conn.on('error', (data) => {
      console.log(data);
    });

  }
}
</script>

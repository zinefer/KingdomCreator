<template>
  <div>
    <Page :subtitle="$t('index_page_subtitle')" :selectedType="selectedType">
      <div class="content">
        <DraftingSidebar :players="players" :hostSetsIds="hostSets" :hosting="hosting" />

        <div class="main">
          <DraftSupply :supplyCards="draftSupply" :disableSets="true" />

          <hr/>

          <DraftingHand :supplyCards="draftHand" v-if="started" :onCardClick="handleClick" />

          <div class="options">
            <h1 v-if="draftState.length" style="float: left">{{ draftState }}</h1>

            <button @click="startDraft" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
              v-if="hosting && connected && !started"
            >
              Start Draft
            </button>
            
            <CopyButton :text="getUrl" class="preset-kingdom-copy-button" v-if="connected && !started" />
            
            <button @click="hostDraft" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
              :disabled="isEmpty(draftPlayerName)"
              v-if="!connected && isEmpty(draftHostId)"
            >
              Host Draft
            </button>

            <button @click="joinDraft" type="button" 
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
              :disabled="isEmpty(draftPlayerName) || isEmpty(draftHostId)"
              v-if="!connected && !isEmpty(draftHostId)"
            >
              Join Draft
            </button>

            <input v-model="draftPlayerName"
              class="standard-input"
              v-if="!connected"
              placeholder="player name" />
          </div>

          <div class="clearfix"></div>
          <br/><br/>
        </div>
      </div>
    </Page>
    <EnlargeButton />
  </div>
</template>

<script lang="ts">
import { Component, Watch } from "vue-property-decorator";
import Base from "./base";
import EnlargeButton from "../components/EnlargeButton.vue";
import CopyButton from "../components/CopyButton.vue";
import Page, { MenuItemType } from "../components/Page.vue";
import DraftingSidebar from "../components/DraftingSidebar.vue";
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

import { SetId } from "../dominion/set-id";

@Component({
  components: {
    Page,
    DraftingSidebar,
    CopyButton,
    EnlargeButton,
    DraftingHand,
    DraftSupply
  },
})

export default class Drafting extends Base {
  selectedType = MenuItemType.DRAFT;
  draftHostId = '';
  draftPlayerName = '';
  draftState = '';
  draft!: Draft;
  
  connected = false;
  hosting = false;
  started = false;

  peerConnection!: Peer.DataConnection;

  draftHand: SupplyCard[] = [];

  draftSupply: SupplyCard[] = [];

  players: Player[] = [];

  seenCards!: SupplyCard[];

  hostSets: SetId[] = [];

  waitingChoiceCallback!: Function;

  @State(state => state.randomizer.settings) readonly settings!: Settings;
  @State(state => state.randomizer.selection) readonly selection!: Selection;

  peer = new Peer({});

  created() {
    let host = this.$route.query.host.toString();

    if (host.length) {
      this.draftHostId = host;
    }
  }

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
      //this.$route.query.host = id;
      this.$router.replace({ query: {host: id} });
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
              let player = new Player(msg.data.name);
              player.connection = conn;

              conn.on('close', () => {
                this.draft.leave(player.name);
              });
              
              this.players.push(player);

              this.draft.join(player.name);

              this.sendToAll({
                type: 'hostinfo',
                data: {
                  sets: this.settings.selectedSets
                }
              });
            } catch (error) {
              console.log(error);
            }
          break;

          case 'choice':
            this.waitingChoiceCallback(msg.data.choice);      
          break;

          case 'setinfo':
            let player = this.getPlayerByName(msg.data.name);
            player!.selectedSets = msg.data.sets;
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
    this.draftState = 'Draft started';
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

  get getUrl() : string {
    return window.location.href;
  }

  get shouldDisableSets() : boolean {
    return true; //!this.connected || this.hosting;
  }

  @Watch("settings")
  onSettingsChanged() {
    if (this.connected) {
      if (this.hosting) {
        this.sendToAll({
          type: 'hostinfo',
          data: {
            sets: this.settings.selectedSets
          }
        });
      } else {
        this.sendSets(this.peerConnection);
      }
    }
  }

  private sendToAll(msg:any) {
    this.players.forEach(player => {
      console.log('send to ' + player.name);
      if (player.name == this.draftPlayerName) return;
      player.connection.send(msg);
    });
  }

  private draftHostHandlers() {
    this.draft.on('choose', (playerName, hand, callback) => {
        this.waitingChoiceCallback = callback;

        let chooser = this.getPlayerByName(playerName);
        chooser!.choosing = true;

        if (chooser!.name === this.draftPlayerName) {
          this.draftState = 'Choose a card';
          this.addCardIdsToDraftHand(hand);
          this.sendToAll({
            type: 'choosing',
            data: {
              player: playerName
            }
          })
        } else {
          chooser!.connection.send({
            type: 'choose', 
            data: hand
          });

          this.draftState = chooser!.name + ' is choosing';

          this.sendToAll({
            type: 'choosing',
            data: {
              player: chooser!.name
            }
          });
        }
    }).on('joined', (playerName) => {
      this.sendAllPlayerList();
    }).on('left', (playerName) => {
      let index = this.players.findIndex(player => player.name === playerName);
      this.players.splice(index, 1);
      this.sendAllPlayerList()
    }).on('choice', (playerName, choice) => {
      this.getPlayerByName(playerName)!.choosing = false;
      this.draftState = playerName + ' chose';
      this.addChoiceToKingdom(playerName, choice);
      this.sendToAll({
        type: 'choice', 
        data: {
          player: playerName,
          choice: choice
        }
      });
    });

  }

  private sendSets(connection:Peer.DataConnection) {
    connection.send({
      type: 'setinfo',
      data: {
        name: this.draftPlayerName,
        sets: this.settings.selectedSets
      }
    });
  }

  private sendAllPlayerList() {
    this.sendToAll({
      type: 'playerinfo',
      data: {
        players: this.draft.getPlayers(),
      }
    });
  }

  private addChoiceToKingdom(player:string, cardId:string) {
    let cards = this.draftSupply.concat();
    cards.push(DominionSets.getSupplyCardById(cardId))
    this.draftSupply = cards;
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

    this.draftState = "Connecting to host";

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

      this.sendSets(conn);

      this.draftState = "Connected. Waiting for host";
      
    });

    conn.on('data', (msg) => {
      console.log(msg);
      switch (msg.type) {
        case 'playerinfo':
          let newPlayers : Player[] = [];
          msg.data.players.forEach((player: string) => {
            newPlayers.push(new Player(player));
          });
          this.players = newPlayers;
        break;

        case 'start':
          this.draftStarted();
        break;

        case 'choose': 
          this.addCardIdsToDraftHand(msg.data);
          this.draftState = 'Choose a card';
        break;

        case 'choosing':
          let choosingPlayer = this.getPlayerByName(msg.data.player);
          choosingPlayer!.choosing = true;
          if (choosingPlayer!.name != this.draftPlayerName) {
            this.draftState = choosingPlayer!.name + ' is choosing';
          }
        break;

        case 'choice':
          let chosePlayer = this.getPlayerByName(msg.data.player);
          chosePlayer!.choosing = false;
          this.draftState = chosePlayer!.name + ' chose';
          this.addChoiceToKingdom(msg.data.player, msg.data.choice);
        break;

        case 'hostinfo':
          this.hostSets = msg.data.sets;
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

  private isEmpty(value: string) {
    return value.length == 0;
  }
}
</script>

<template>
  <div>
    <Page :subtitle="$t('index_page_subtitle')" :selectedType="selectedType">
      <div class="content">
        <DraftingSidebar :players="players" :hostSetsIds="hostSets" :hosting="hosting" />

        <div class="main">
          <DraftSupply :supplyCards="draftSupply" :addonCards="draftAddons" :disableSets="true" :numberOfAddonCards="wantedDraftAddonss" />

          <hr/>

          <div class="options">
            <h1 v-if="draftState.length" style="float: left">{{ draftState }}</h1>

            <button @click="startDraft" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
              v-if="hosting && connected && !started"
            >
              Start Draft
            </button>

            <CopyButton :text="getCopyButtonText" class="preset-kingdom-copy-button" v-if="complete" />

            <button @click="restartDraft" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
              v-if="hosting && connected && started && complete"
            >
              ↻ Restart
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

          <DraftingHand :cards="draftHand" :addonHand="draftingAddons" v-if="started" :onCardClick="handleHandClick" />

          <!-- <br/> -->

          <button v-if="auditing" @click="handleAuditBan" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
            >
            Ban
          </button>
          <button v-if="auditing" @click="handleAuditKeep" type="button"
              class="standard-button standard-button--is-primary standard-button--large desktop_randomize-button"
            >
            Keep
          </button>

          <br/>
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
import { Card } from "../dominion/card";
import { Addon } from "../dominion/addon";
import { SupplyCard } from "../dominion/supply-card";

import { Peer, DataConnection } from 'peerjs'

import { Draft } from "../drafting/draft";
import { Player } from "../drafting/player"

import { DominionSets } from "../dominion/dominion-sets"
import { Supply, Replacements } from "../randomizer/supply";

import { SetId } from "../dominion/set-id";

const playerNameStorageKey = 'draft-player-name';

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
  draftingAddons = false;
  auditing = false;
  complete = false;

  currentPlayerIndex = 0;

  peerConnection!: DataConnection;

  players: Player[] = [];

  draftHand: Card[] = [];

  draftSupply: SupplyCard[] = [];

  draftAddons: Addon[] = [];

  wantedDraftAddons = 0;

  hostSets: SetId[] = [];

  waitingChoiceCallback!: Function;
  waitingAuditCallback!: Function;

  @State(state => state.randomizer.settings) readonly settings!: Settings;
  @State(state => state.randomizer.selection) readonly selection!: Selection;

  peer = new Peer({});

  created() {
    let host = this.$route.query.host.toString();
    if (host.length) {
      this.draftHostId = host;
    }
  }

  mounted() {
    this.draftPlayerName = localStorage.getItem(playerNameStorageKey) || '';
  }

  get wantedDraftAddonss() {
    return this.wantedDraftAddons;
  }

  get getDraftHostId() {
    return this.draftHostId;
  }

  hostDraft() {
    this.peer = new Peer({});

    let host = new Player(this.draftPlayerName);
    this.players.push(host);

    localStorage.setItem(playerNameStorageKey, this.draftPlayerName);

    this.peer.on('error', (data) => {
        console.log('error ' + data);
      });

    this.peer.on('open', (id) => {
      console.log(id);

      this.draftHostId = id;
      this.$router.replace({ query: {host: id} });
      this.connected = true;
      this.hosting = true;

      this.draft = new Draft(this.settings);
      this.draftHostHandlers();
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (msg:any) => {
        console.log(msg);
        
        switch (msg.type) {
          case 'join':
            try {
              let player = this.addPlayer(msg.data.name);
              player.connection = conn;
              player.connected = true;

              conn.on('close', () => {
                let player = this.getPlayerByName(msg.data.name);
                
                if (this.started) {
                  player!.connected = false;
                } else {
                  this.players = this.players.filter((p) => {
                    return p.name != player!.name;
                  });
                }
                
                this.sendAllPlayerList();
              });

              this.sendAllPlayerList();

              this.sendToAll({
                type: 'hostinfo',
                data: {
                  sets: this.settings.selectedSets
                }
              });

              if (this.started) {
                conn.send({
                  type: 'start',
                  data: {
                    wantedAddons: this.draft.getWantedAddons(),
                  }
                });
                conn.send({
                  type: 'cards',
                  data: {
                    supply: this.draftSupply.map((card) => {
                      return card.id
                    }),
                    addons: this.draftAddons.map((card) => {
                      return card.id
                    })
                  }
                });
                
                if (player.current) {
                  console.log('CURRENT REJOIN');
                  if (player.auditing) {
                    conn.send({
                      type: 'audit'
                    });
                  } else {
                    conn.send({
                      type: 'choose',
                      data: this.draft.getCurrentHand()
                    });
                  }
                }
              }
            } catch (error:any) {
              console.log(error);

              conn.send({
                type: 'error',
                data: {
                  player: this.draftPlayerName,
                  error: error.message
                }
              });
            }
          break;

          case 'choice':
            this.waitingChoiceCallback(msg.data.choice);
          break;

          case 'review':
            {
              let player = this.currentPlayer();
              player!.auditing = false;
              this.waitingAuditCallback(msg.data);
            }
          break;

          case 'setinfo':
            {
              let player = this.getPlayerByName(msg.data.name);
              player!.selectedSets = msg.data.sets;
            }
          break;

          default:
            console.log('Error');
            console.log(JSON.stringify(msg));
          break;
        }
      });

      conn.on('error', (data:any) => {
        console.log(data);
      });
    });
  }

  restartDraft() {
    this.started = false;
    this.draftingAddons = false;
    this.complete = false;
    this.draftSupply = [];
    this.draftAddons = [];
    this.players = this.players.filter((player) => {
      return player.connected == true;
    });
  }

  clear() {
    this.players = [];
    this.connected = false;
  }

  startDraft() {
    this.draft.setSettings(this.settings);
    this.draft.start();
    this.sendToAll({
      type: 'start',
      data: {
        wantedAddons: this.draft.getWantedAddons(),
      }
    });
    this.wantedDraftAddons = this.draft.getWantedAddons();
    this.draftStarted();
  }

  private draftStarted() {
    this.started = true;
    this.draftSupply = []
    this.draftAddons = [];
    this.draftState = 'Draft started';
  }

  handleHandClick(card:Card) {
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

  handleAuditBan() {
    if (this.hosting) {
      this.waitingAuditCallback(false);
    } else {
      this.peerConnection.send({
        type: 'review',
        data: false
      });
    }
    this.auditing = false;
  }

  handleAuditKeep() {
    console.log('audit keep click');
    if (this.hosting) {
      this.waitingAuditCallback(true);
    } else {
      this.peerConnection.send({
        type: 'review',
        data: true
      });
    }
    this.auditing = false;
  }

  get getCopyButtonText() : string {
    return (this.draftSupply as Card[]).concat(
      this.draftAddons
    ).map((card) => this.$t(card.id)).join(", ");
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
      if (player.connected) {
        console.log('send to ' + player.name, msg);
        if (player.name == this.draftPlayerName) return;
        player.connection.send(msg);
      }
    });
  }

  private draftHostHandlers() {
    this.draft.on('choose', (msg:any, callback:Function) => {
      this.waitingChoiceCallback = callback;

      let cardType = msg.type;
      let hand = msg.cards;

      let chooser = this.currentPlayer();
      chooser!.current = true;

      if (chooser!.name === this.draftPlayerName) {
        this.draftState = 'Choose a card';
        this.draftingAddons = cardType == 'addon';
        this.addCardIdsToDraftHand(hand);
        this.sendToAll({
          type: 'choosing',
          data: {
            player: chooser!.name
          }
        });
      } else {
        chooser!.connection.send({
          type: 'choose', 
          data: {
            type: cardType,
            cards: hand
          }
        });

        this.draftState = chooser!.name + ' is choosing';

        this.sendToAll({
          type: 'choosing',
          data: {
            player: chooser!.name
          }
        });
      }
    }).on('supply', (choice:any) => {
      let player = this.currentPlayer();
      player.current = false;
      this.draftState = player.name + ' chose';
      console.log('host supply choice event', choice)
      this.addChoiceToKingdom(player.name, choice);
      this.sendToAll({
        type: 'supply', 
        data: {
          player: player.name,
          choice: choice
        }
      });

      this.nextPlayer();
    }).on('addon', (choice:any) => {
      let player = this.currentPlayer();
      player.current = false;
      this.draftState = player.name + ' chose';
      console.log('host addon choice event', choice)
      this.addChoiceToAddons(player.name, choice);
      this.sendToAll({
        type: 'addon', 
        data: {
          player: player.name,
          choice: choice
        }
      });
      this.nextPlayer();
    }).on('audit', (callback:Function)=> {
      this.waitingAuditCallback = callback;

      let auditor = this.currentPlayer();
      auditor!.current = true;
      auditor!.auditing = true;

      if (auditor!.name === this.draftPlayerName) {
        this.draftState = 'Veto the last event?';
        this.auditing = true;
        this.sendToAll({
          type: 'auditing',
          data: {
            player: auditor!.name
          }
        })
      } else {
        auditor!.connection.send({
          type: 'audit'
        });

        this.draftState = auditor!.name + ' is auditing';

        this.sendToAll({
          type: 'auditing',
          data: {
            player: auditor!.name
          }
        });
      }
    }).on('vetoed', () => {
      this.draftAddons.pop()
      let auditor = this.currentPlayer();
      auditor!.current = false;
      auditor!.auditing = false;
      this.sendToAll({
        type: 'vetoed',
        data: {
          player: auditor!.name
        }
      });
      this.nextPlayer();
    }).on('complete', () => {
      this.complete = true;
      this.sendToAll({
        type: 'complete'
      });
    });
  }

  private addPlayer(name: string): Player {
      if (this.players.length == 6) {
          throw new Error('Draft is full');
      }

      if (this.started) {
          let player = this.getPlayerByName(name);

          if (player && player!.connected == false) {
            return player;
          } else {
            throw new Error("Draft has started");
          }
      }

      if (this.getPlayerByName(name) !== undefined) {
          throw new Error("User already in draft");
      }

      let player = new Player(name);
      this.players.push(player);

      return player;
  }

  private currentPlayer(): Player {
      return this.players[this.currentPlayerIndex];
  }

  private nextPlayer(): void {
      this.currentPlayerIndex = 
          (this.currentPlayerIndex + 1) % this.players.length;
      
      if (this.players[this.currentPlayerIndex].connected == false) {
        this.nextPlayer();
      }
  }

  private sendSets(connection:DataConnection) {
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
        players: this.players.map((player) => {
          return {
            name: player.name,
            connected: player.connected,
            current: player.current
          };
        }),
      }
    });
  }

  private addChoiceToKingdom(player:string, cardId:string) {
    let cards = this.draftSupply.concat();
    cards.push(DominionSets.getSupplyCardById(cardId))
    this.draftSupply = cards;
  }

  private addChoiceToAddons(player:string, cardId:string) {
    let cards = this.draftAddons.concat();
    cards.push(DominionSets.getCardById(cardId) as Addon)
    this.draftAddons = cards;
  }
  
  private getPlayerByName(name:string) {
    return this.players.find(i => i.name === name);
  }

  private addCardIdsToDraftHand(cards:string[]) {
    cards.forEach((cardId:string) => {
      this.draftHand.push(DominionSets.getCardById(cardId));
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

    conn.on('data', (msg:any) => {
      console.log('player conn on data ', msg);
      switch (msg.type) {
        case 'playerinfo':
          let newPlayers : Player[] = [];
          msg.data.players.forEach((p: Player) => {
            let player = new Player(p.name);
            player.connected = p.connected;
            player.current = p.current;
            newPlayers.push(player);
          });
          this.players = newPlayers;
        break;

        case 'start':
          this.draftStarted();
          this.wantedDraftAddons = msg.data.wantedAddons;
        break;

        case 'cards':
          this.draftSupply = [];
          msg.data.supply.forEach((cardId:string) => {
            this.addChoiceToKingdom('unknown', cardId);
          });

          this.draftAddons = [];
          msg.data.addons.forEach((cardId:string) => {
            this.addChoiceToAddons('unknown', cardId);
          });
        break;

        case 'choose': 
          this.draftingAddons = msg.data.type == 'addon';
          this.addCardIdsToDraftHand(msg.data.cards);
          this.draftState = 'Choose a card';
        break;

        case 'audit':
          this.draftState = 'Veto the last event?';
          this.auditing = true;
        break;

        case 'vetoed':
          let player = this.getPlayerByName(msg.data.player);
          player!.current = false;
          player!.auditing = false;
          this.draftAddons.pop();
          this.nextPlayer();
        break;

        case 'auditing':
        case 'choosing':
          {
            let choosingPlayer = this.getPlayerByName(msg.data.player);
            choosingPlayer!.current = true;
            if (choosingPlayer!.name != this.draftPlayerName) {
              this.draftState = choosingPlayer!.name + ' is ' + msg.type;
            }
          }
        break;

        case 'supply':
          {
            let chosePlayer = this.getPlayerByName(msg.data.player);
            chosePlayer!.current = false;
            this.draftState = chosePlayer!.name + ' chose';
            this.addChoiceToKingdom(msg.data.player, msg.data.choice);
          }
        break;

        case 'addon':
          {
            let chosePlayer = this.getPlayerByName(msg.data.player);
            chosePlayer!.current = false;
            this.draftState = chosePlayer!.name + ' chose';
            this.addChoiceToAddons(msg.data.player, msg.data.choice);
          }
        break;

        case 'hostinfo':
          this.hostSets = msg.data.sets;
        break;

        case 'complete':
          this.complete = true;
        break
      
        default:
          console.log('Error');
          console.log(msg);
        break;
      }

    });

    conn.on('error', (data) => {
      console.log(data);
    });

    conn.on('close', () => {
      this.clear();
      this.draftState = 'Disconnected';
    });

  }

  isEmpty(value: string) {
    return value.length == 0;
  }
}
</script>

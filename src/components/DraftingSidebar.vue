<template>
  <div class="sidebar-container">
    <div class="sidebar">
      <div class="sidebar-content draftinfo">
        <div class="sidebar-content-title">Players</div>
        <div class="players">
          <ul>
            <li v-for="(player, index) in players" :key="player.name" v-bind:class="{ disconnected: !player.connected }">
              <span>{{ player.name }}</span>
              <span v-if="index == 0">👑</span>
              <div v-if="player.current" class="current-icon"></div>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="sidebar">
      <div class="sidebar-content filters">
        <div class="sidebar-content-title">Sets</div>
        <div class="sets">
          <div class="set" v-for="set in sets" :key="set.setId">
            <label class="checkbox">
              <input type="checkbox" 
                     v-model="hostSetsIds" 
                     :id="set.setId" 
                     :value="set.setId"
                     disabled="true"
                     v-if="!hosting" />
              
              <input type="checkbox" 
                     v-model="selectedSetIds" 
                     :id="set.setId" 
                     :value="set.setId" />

              <span>{{ $t(set.setId) }}</span>
              <span>
                <span v-for="index in getNumberOfPlayersWithSetSelected(set)" :key="index" class="selected-icon">
                  ⭐
                </span>
              </span>
            </label>
          </div>
        </div>
        <div class="clear"></div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { UPDATE_SETTINGS } from "../stores/randomizer/mutation-types";
import { DominionSets } from "../dominion/dominion-sets";
import { Getter, State } from "vuex-class";
import { DominionSet } from "../dominion/dominion-set";
import { SetId } from "../dominion/set-id";
import { Vue, Component, Prop } from "vue-property-decorator";
import { Settings, SettingsParams, SortOption } from "../settings/settings";
import { RandomizerSettings, RandomizerSettingsParams } from "../settings/randomizer-settings";

import {Player} from "../drafting/player"

interface SortOptionParam {
  value: SortOption,
  display: string,
}

@Component
export default class RandomizerSidebar extends Vue {
  @Getter("isCondensed") readonly isCondensed!: boolean;
  @Getter("isDistributeCostAllowed") readonly isDistributeCostAllowed!: boolean;
  @Getter("isPrioritizeSetAllowed") readonly isPrioritizeSetAllowed!: boolean;
  @Getter("randomizeButtonText") readonly randomizeButtonText!: string;
  @State(state => state.randomizer.settings) readonly settings!: Settings;
  @State(state => state.randomizer.settings.randomizerSettings)
      readonly randomizerSettings!: RandomizerSettings;

  @Prop() readonly players!: Player[];

  @Prop() readonly disableSets!: boolean;

  @Prop() readonly hosting!: boolean;

  @Prop() readonly hostSetsIds!: SetId[];

  getNumberOfPlayersWithSetSelected(set:DominionSet) {
    return this.players.filter(player => player.selectedSets.indexOf(set.setId) > -1).length;
  }

  get getPlayers() {
    return this.players || [];
  }

  get sets() {
    return DominionSets.getAllSets();
  }

  get selectedSetIds() {
    return this.settings.selectedSets.concat().sort();
  }

  set selectedSetIds(values: string[]) {
    // Clear the prioritized set if it's no longer selected.
    if (!values.some(x => x == this.prioritizeSet)) {
      this.updateRandomizerSettings({prioritizeSet: null});
    }
    this.$store.commit(UPDATE_SETTINGS, {
      selectedSets: values.map(DominionSets.convertToSetId)
    } as SettingsParams);
  }

  get requireActionProvider() {
    return this.randomizerSettings.requireActionProvider;
  }
  set requireActionProvider(value: boolean) {
    this.updateRandomizerSettings({requireActionProvider: value});
  }

  get requireCardProvider() {
    return this.randomizerSettings.requireCardProvider;
  }
  set requireCardProvider(value: boolean) {
    this.updateRandomizerSettings({requireCardProvider: value});
  }
  
  get requireBuyProvider() {
    return this.randomizerSettings.requireBuyProvider;
  }
  set requireBuyProvider(value: boolean) {
    this.updateRandomizerSettings({requireBuyProvider: value});
  }

  get allowAttacks() {
    return this.randomizerSettings.allowAttacks;
  }
  set allowAttacks(value: boolean) {
    this.updateRandomizerSettings({allowAttacks: value});
  }
  
  get requireReaction() {
    return this.randomizerSettings.requireReaction;
  }
  set requireReaction(value: boolean) {
    this.updateRandomizerSettings({requireReaction: value});
  }

  get requireTrashing() {
    return this.randomizerSettings.requireTrashing;
  }
  set requireTrashing(value: boolean) {
    this.updateRandomizerSettings({requireTrashing: value});
  }

  get distributeCost() {
    return this.randomizerSettings.distributeCost;
  }
  set distributeCost(value: boolean) {
    this.updateRandomizerSettings({distributeCost: value});
  }

  get isPrioritizeSetEnabled() {
    return this.randomizerSettings.prioritizeSet != null;
  }
  set isPrioritizeSetEnabled(value: boolean) {
    const setId = value && this.selectedSetIds.length
        ? DominionSets.convertToSetId(this.selectedSetIds.concat().sort()[0])
        : null;
    this.updateRandomizerSettings({prioritizeSet: setId});
  }

  get prioritizeSet() {
    return this.randomizerSettings.prioritizeSet;
  }
  set prioritizeSet(value: SetId | null) {
    this.updateRandomizerSettings({prioritizeSet: value});
  }

  get sortOptions(): SortOptionParam[] {
    return [
      {display: "Set", value: SortOption.SET},
      {display: "Alphabetical", value: SortOption.ALPHABETICAL},
      {display: "Cost", value: SortOption.COST},
    ];
  }

  get selectedSortOption() {
    return this.settings.sortOption;
  }
  set selectedSortOption(sortOption: SortOption) {
    this.$store.commit(UPDATE_SETTINGS, {sortOption: sortOption} as SettingsParams);
  }

  getSetName(setId: SetId) {
    return DominionSets.getSetById(setId).name;
  }

  private updateRandomizerSettings(params: RandomizerSettingsParams) {
    this.$store.commit(UPDATE_SETTINGS, {
      randomizerSettings: params
    } as SettingsParams);
  }
}
</script>

<style>
.desktop_randomize-button,
.condensed_randomize-button {
  display: block;
  margin: 2px;
}
.condensed_randomize-button {
  margin-top: 12px;
}

.players li.disconnected {
  color: lightgray;
}
</style>
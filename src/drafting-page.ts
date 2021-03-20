import Drafting from "./views/Drafting.vue";
import { store } from "./stores/index-store";
import { initialize } from "./setup";
import { createRouter } from "./router";

initialize(createRouter(["/drafting.html"], Drafting), store);


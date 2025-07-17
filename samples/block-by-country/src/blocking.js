import * as Kv from "@spinframework/spin-kv";
import { getClientAddressFromRequest, cleanupIpAddress } from "./helpers";

const blockByCountry = async (request) => {
  const clientAddress = getClientAddressFromRequest(request);

  if (!clientAddress) {
    return new Response("Could not determine client ip address", { status: 401 });
  }
  const blocklist = loadBlocklist();
  const ip = cleanupIpAddress(clientAddress);

  const response = await fetch(`http://ip-api.com/json/${ip}`);
  const details = await response.json();

  if (blocklist.indexOf(details.country) > -1) {
    return new Response(`Sorry, your Country (${details.country}) is blocked`, { status: 401 });
  }
}

const loadBlocklist = () => {
  const store = Kv.openDefault();
  if (!store.exists("blocklist")) {
    return [];
  }
  return store.getJson("blocklist");
};


const storeBlocklist = (blocklist) => {
  const store = Kv.openDefault();
  if (!blocklist) {
    blocklist = [];
  }
  store.setJson("blocklist", blocklist);
}


export {
  blockByCountry,
  loadBlocklist,
  storeBlocklist
};

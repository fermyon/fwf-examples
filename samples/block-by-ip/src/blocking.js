import * as Kv from "@spinframework/spin-kv";
import { getClientAddressFromRequest, cleanupIpAddress } from "./helpers";

const blockByIp = (request) => {
  const clientAddress = getClientAddressFromRequest(request);

  if (!clientAddress) {
    return new Response("Could not determine client ip address. Request will be blocked", {
      status: 401
    });
  }
  const blocklist = loadBlocklist();
  const ip = cleanupIpAddress(clientAddress);

  if (blocklist.indexOf(ip) > -1) {
    return new Response("Sorry, your IP is blocked", {
      status: 401
    });
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
  blockByIp,
  loadBlocklist,
  storeBlocklist
};

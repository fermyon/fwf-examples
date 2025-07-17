import * as Variables from '@spinframework/spin-variables';
import { IRequest } from "itty-router";

/**
 * Application Configuration 
 */
export interface Config {
  url: string,
  key: string,
  cacheTtl: number,
  webhookToken: string,
}

/**
  * Middleware to load application configuration
  * An instance of {@link Config} is set on the request
  *
  * @param request The {@link IRequest} automatically passed by itty-router
  * @throws An error if required configuration data is falsy
  */
export function withConfig(request: IRequest) {
  const url = Variables.get('supabase_url');
  const key = Variables.get('supabase_key');
  const ttl = +(Variables.get('cache_ttl') ?? "5");
  const webhookToken = Variables.get('supabase_webhook_token');

  if (!url || !key || !webhookToken) {
    throw new Error("Required Configuration data not set");
  }
  // set the config on the actual request
  request.config = {
    url,
    key,
    cacheTtl: ttl,
    webhookToken
  } as Config;
}

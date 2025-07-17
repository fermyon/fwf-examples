import { createClient } from '@supabase/supabase-js';
import { AutoRouter, json } from 'itty-router';
import { ALL_ARTICLES_CACHE_KEY, buildKey, invalidate, readFromCache, storeInCache } from './cache';
import { Config, withConfig } from './middlewares';
import { processDatabaseUpdate } from './inform';

const decoder = new TextDecoder();

let router = AutoRouter();

router
  .all('*', withConfig)
  .get('/articles', ({ config }) => readArticles(config))
  .post('/articles', async (req) => createArticle(await req.arrayBuffer(), req.config as Config))
  .get('/articles/:id', ({ id, config }) => readArticleById(id, config))
  .put('/articles/:id', async (req) => updateArticleById(req.params.id, await req.arrayBuffer(), req.config as Config))
  .delete('/articles/:id', ({ id, config }) => deleteArticleById(id, config))
  .post("/inform", async (req) => onDatabaseUpdate(req.headers, await req.arrayBuffer(), req.config as Config));

const onDatabaseUpdate = (headers: Headers, requestBody: ArrayBuffer, config: Config): Response => {
  const token = headers.get("x-webhook-token");
  if (!token || token !== config.webhookToken) {
    console.log("Webhook invoked without or with invalid token")
    return new Response(null, { status: 401 });
  }
  return processDatabaseUpdate(requestBody)

}
//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
  event.respondWith(router.fetch(event.request));
});

const readArticles = async (config: Config): Promise<Response> => {
  const cached = readFromCache(ALL_ARTICLES_CACHE_KEY);
  if (cached) {
    return json(cached, { status: 200, headers: { 'x-served-via-cache': 'true' } });
  }
  const supabase = createClient(config.url, config.key);
  const { data, error } = await supabase.from('articles')
    .select()
    .order('created_at', { ascending: false });
  if (error) {
    console.log(`Error while reading single article: ${error.message} ${error.details} ${error.stack}`);
    return new Response(error.message, { status: 500 });
  }
  storeInCache(ALL_ARTICLES_CACHE_KEY, data, config.cacheTtl);
  return json(data, { status: 200 });
}

const readArticleById = async (id: string, config: Config): Promise<Response> => {
  const cacheKey = buildKey(id);
  const cached = readFromCache(cacheKey);
  if (cached) {
    return json(cached, { status: 200, headers: { 'x-served-via-cache': 'true' } });
  }
  const supabase = createClient(config.url, config.key);
  const { data, error } = await supabase.from('articles')
    .select()
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.log(`Error while reading single article: ${error.message} ${error.details} ${error.stack}`);
    return new Response(error.message, { status: 500 });
  }
  if (!data) {
    return new Response("Not Found", { status: 404 });
  }
  storeInCache(cacheKey, data, config.cacheTtl);
  return json(data, { status: 200 });
}

const createArticle = async (requestBody: ArrayBuffer, config: Config): Promise<Response> => {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(requestBody));
  } catch (error) {
    return new Response("Bad Request", { status: 400 });
  }

  if (!payload.title || !payload.content) {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = createClient(config.url, config.key);
  const { data, error } = await supabase
    .from('articles')
    .insert({ title: payload.title, content: payload.content })
    .select()
    .single();
  if (error) {
    console.log(`Error while storing article in database: ${error.message} ${error.details} ${error.stack}`);
    return new Response('Internal Server Error', { status: 500 });
  }
  const cacheKey = buildKey(data.id);
  storeInCache(cacheKey, data, config.cacheTtl);
  return json(data, { status: 201 });
}

const deleteArticleById = async (id: string, config: Config): Promise<Response> => {
  const supabase = createClient(config.url, config.key);
  const response = await supabase.from('articles').delete().eq('id', id);
  if (response.error) {
    console.log(`Error while deleting article from database: ${response.error.message} ${response.error.details} ${response.error.stack}`);
    return new Response('Internal Server Error', { status: 500 });
  }
  if (response.count == 0) {
    return new Response('Not Found', { status: 404 });
  }
  invalidate(buildKey(id))
  return new Response(null, { status: 204 });
}

const updateArticleById = async (id: string, requestBody: ArrayBuffer, config: Config): Promise<Response> => {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(requestBody));
  } catch (error) {
    return new Response("Bad Request", { status: 400 });
  }

  if (!payload.title || !payload.content) {
    return new Response("Bad Request", { status: 400 });
  }

  const supabase = createClient(config.url, config.key);
  const { data, error } = await supabase
    .from('articles')
    .update({ title: payload.title, content: payload.content, published: payload.published })
    .eq('id', id)
    .select().maybeSingle();
  if (error) {
    console.log(`Error while updating article in database: ${error.message} ${error.details} ${error.stack}`);
    return new Response('Internal Server Error', { status: 500 });
  }
  if (!data) {
    return new Response('Not Found', { status: 404 });
  }
  storeInCache(buildKey(id), data, config.cacheTtl)
  return json(data, { status: 200 });
}

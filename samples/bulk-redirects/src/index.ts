import { AutoRouter } from 'itty-router';

const router = AutoRouter();

router
    .get('/redirect1', () => {
        return new Response('Redirect 1')
    })
    .get('/redirect2', () => {
        return new Response('Redirect 2')
    })
    .get('/redirect3', () => {
        return new Response('Redirect 3')
    })
    .get('/redirect4', () => {
        return new Response('Redirect 4')
    })
    .get('/bulk*', bulkRedirect);
        
async function bulkRedirect(request: Request): Promise<Response> {
    const requestURL = new URL(request.url);
    const externalHostname = requestURL.origin;

    const redirectMap = new Map([
      ["/bulk1", externalHostname + "/redirect2"],
      ["/bulk2", externalHostname + "/redirect3"],
      ["/bulk3", externalHostname + "/redirect4"],
      ["/bulk4", "https://google.com"],
    ]);

    const path = requestURL.pathname;
    const location = redirectMap.get(path);

    if (location) {
      return Response.redirect(location, 301);
    }
    // If request not in map, return the original request
    return new Response("Not Found", { status: 404 });
}

//@ts-ignore
addEventListener('fetch', async (event: FetchEvent) => {
    event.respondWith(router.fetch(event.request));
});

import { Configuration, ErrorTracker, HttpCrawler, MemoryStorage } from "crawlee";
import type { Logger } from "../logger.js";

/** Small bounded Crawlee transport shared by the public promotion catalogues. */
export async function crawlPromotionDocuments(input: {
  name: string;
  startUrl: string;
  logger: Logger;
  maxRequests?: number;
  timeoutSecs?: number;
  read: (body: string, url: string, kind: string) => { next?: { url: string; kind: string }[] } | void;
}): Promise<void> {
  const config = new Configuration();
  config.useStorageClient(new MemoryStorage({ persistStorage: false }));
  let failure: Error | undefined;
  const crawler = new HttpCrawler({
    maxConcurrency: 1, maxRequestsPerCrawl: input.maxRequests ?? 6, maxRequestRetries: 2,
    navigationTimeoutSecs: input.timeoutSecs ?? 30, requestHandlerTimeoutSecs: 30,
    useSessionPool: false, ignoreSslErrors: false,
    additionalMimeTypes: ["application/javascript", "text/javascript", "application/ecmascript"],
    requestHandler: async ({ body, request, response }) => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
      const result = input.read(Buffer.isBuffer(body) ? body.toString("utf8") : String(body), request.loadedUrl ?? request.url, String(request.userData.kind ?? "page"));
      if (result?.next) await crawler.addRequests(result.next.map(({ url, kind }) => ({ url, userData: { kind } })));
    },
    failedRequestHandler: async ({ request }, error) => {
      // Query URLs contain public GROQ, not credentials. Limit upstream error text.
      failure = new Error(`${input.name}: ${request.url} failed after retries: ${error.message.slice(0, 400)}`, { cause: error });
      input.logger.warn(failure.message);
    },
  }, config);
  crawler.stats.errorTracker = new ErrorTracker({ showErrorMessage: false });
  crawler.stats.errorTrackerRetry = new ErrorTracker({ showErrorMessage: false });
  await crawler.run([{ url: input.startUrl, userData: { kind: "page" } }]);
  if (failure) throw failure;
}

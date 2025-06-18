import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import puppeteer, { Browser } from 'puppeteer'; // Browserをインポート
import * as cheerio from 'cheerio';

// インターフェースや、cleanText, extractLinks, getDomain関数は変更なし
interface CrawlResult {
  url: string;
  text: string;
}
interface CrawlError {
  url: string;
  error: string;
}
const cleanText = (html: string): string => {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, header, footer, nav').remove();
  let text = $('body').text();
  text = text.replace(/\s\s+/g, ' ').trim();
  return text;
};
const extractLinks = (html: string, baseUrl: string): string[] => {
  const links: string[] = [];
  const $ = cheerio.load(html);
  $('a').each((_, element) => {
    const href = $(element).attr('href');
    if (href) {
      try {
        const url = new URL(href, baseUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          links.push(url.href.split('#')[0]);
        }
      } catch { }
    }
  });
  return Array.from(new Set(links));
};
const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// crawlPage関数は、引数に browser を受け取るように変更
const crawlPage = async (
  browser: Browser, // browserインスタンスを受け取る
  url: string,
  visited: Set<string>,
  baseDomain: string,
  currentDepth: number,
  maxDepth: number,
  results: CrawlResult[],
  errors: CrawlError[]
): Promise<void> => {
  const normalizedUrl = new URL(url).href;
  if (currentDepth > maxDepth || visited.has(normalizedUrl)) {
    return;
  }
  const domain = getDomain(normalizedUrl);
  if (domain !== baseDomain) {
    return;
  }
  visited.add(normalizedUrl);
  console.log(`[CRAWLING] Visiting: ${normalizedUrl} at depth ${currentDepth}`);

  let page;
  try {
    // 新しいブラウザを起動するのではなく、新しいページ（タブ）を開く
    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font') {
        request.abort();
      } else {
        request.continue();
      }
    });
    await page.goto(normalizedUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const html = await page.content();
    // ページを閉じる（ブラウザは閉じない）
    await page.close();

    const text = cleanText(html);
    if (text.length > 0) {
      results.push({ url: normalizedUrl, text });
    }

    if (currentDepth < maxDepth) {
      const links = extractLinks(html, normalizedUrl);
      console.log(`[CRAWLER DEBUG] Found ${links.length} links on ${normalizedUrl}`);

      const crawlPromises = links.map(link =>
        // 再帰呼び出しにも browser を渡す
        crawlPage(browser, link, visited, baseDomain, currentDepth + 1, maxDepth, results, errors)
      );

      const batchSize = 3;
      for (let i = 0; i < crawlPromises.length; i += batchSize) {
        const batch = crawlPromises.slice(i, i + batchSize);
        await Promise.allSettled(batch);
      }
    }
  } catch (error) {
    if (page) await page.close();
    errors.push({
      url: normalizedUrl,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// executeメソッドをリファクタリング
export const crawlerTool = createTool({
  id: 'web-crawler',
  description: '指定されたWebサイトを巡回し、各ページのテキストコンテンツを取得します。',
  inputSchema: z.object({
    startUrl: z.string().url().describe('クロールを開始するURL'),
    maxDepth: z.number().min(0).max(5).describe('巡回する階層の深さ（0-5）'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      url: z.string(),
      text: z.string(),
    })),
    errors: z.array(z.object({
      url: z.string(),
      error: z.string(),
    })),
    summary: z.object({
      totalPages: z.number(),
      totalErrors: z.number(),
      crawlDepth: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const { startUrl, maxDepth } = context;
    const visited = new Set<string>();
    const results: CrawlResult[] = [];
    const errors: CrawlError[] = [];
    const baseDomain = getDomain(startUrl);

    if (!baseDomain) {
      throw new Error('Invalid start URL provided');
    }

    // 最初に一度だけブラウザを起動
    const browser = await puppeteer.launch();
    try {
      // crawlPageにbrowserインスタンスを渡す
      await crawlPage(browser, startUrl, visited, baseDomain, 0, maxDepth, results, errors);
    } finally {
      // 全ての処理が終わったら、最後にブラウザを閉じる
      await browser.close();
    }

    return {
      results,
      errors,
      summary: {
        totalPages: results.length,
        totalErrors: errors.length,
        crawlDepth: maxDepth,
      },
    };
  },
});
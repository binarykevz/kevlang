declare const process: any;
declare const console: any;
declare const Bun: any;

declare const Request: any;
declare const Response: any;
declare const URL: any;
declare const Headers: any;

declare function setTimeout(
  handler: (...args: any[]) => void,
  timeout?: number,
  ...args: any[]
): any;

declare function clearTimeout(handle?: any): void;

declare function setInterval(
  handler: (...args: any[]) => void,
  timeout?: number,
  ...args: any[]
): any;

declare function clearInterval(handle?: any): void;

declare module "node:fs/promises";
declare module "bun:sqlite";

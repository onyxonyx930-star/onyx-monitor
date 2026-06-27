import handler from './index.js';

export default {
  async fetch(request: Request): Promise<Response> {
    return (handler as any).fetch(request);
  }
};

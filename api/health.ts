export default {
  fetch(request: Request) {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
  },
};

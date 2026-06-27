import app from './index';

const handler = async (req: any, res: any) => {
  return app(req, res);
};

export default handler;

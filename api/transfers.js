import handler from './[...path].js';
export default (req, res) => handler({ ...req, query: { ...(req.query || {}), path: req.query?.id ? ['transfers', String(req.query.id)] : ['transfers'] } }, res);

import handler from '../[...path].js';
export default (req, res) => handler({ ...req, query: { ...(req.query || {}), path: ['transfers', String(req.query?.id || '')] } }, res);

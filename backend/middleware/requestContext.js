import { v4 as uuidv4 } from 'uuid';

export const requestContext = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
};

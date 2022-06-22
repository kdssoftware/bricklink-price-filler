// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { addBulkSID, getSID, updateBulkSID } from '../../lib/Db';

// always POST => body : { body, link, method }
export default  async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
    switch(req.method){
        case "GET":
            const SID = await getSID(req.query.customer_key as string)
            console.log(SID)
            res.status(200).json(SID)
            return;
        case "POST":
            await addBulkSID( req.query.customer_key as string,req.body.SID)
            res.status(200).send("DONE")
            return;
        case "PUT":
            await updateBulkSID(req.query.customer_key as string,req.body.SID)
            res.status(200).send("DONE")
            return;
        default:
            res.status(404).send("NOT FOUND")
            return;
    }
}
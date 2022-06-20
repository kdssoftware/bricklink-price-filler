// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'
import { OAuth } from "oauth";


// always POST => body : { body, link, method }
export default  async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  type secrets = {
    TOKEN_VALUE?: string;
    TOKEN_SECRET?: string;
    CONSUMER_KEY?: string;
    CONSUMER_SECRET?: string;
  }

  const secretsReady = new Boolean(req.cookies?.secretsReady) as boolean
  const bl_secrets = JSON.parse(req.cookies.bl_secrets) as secrets
  let oauth = new OAuth(
    (bl_secrets.TOKEN_SECRET ?? "").trim(),
    (bl_secrets.TOKEN_VALUE ?? "").trim(),
    (bl_secrets.CONSUMER_KEY ?? "").trim(),
    (bl_secrets.CONSUMER_SECRET ?? "").trim(),
    "1.0",
    null,
    "HMAC-SHA1"
  )
  switch (req.body.method ?? "GET") {
    case "GET": 
      oauth.get(req.body.link, bl_secrets.TOKEN_VALUE ?? "", bl_secrets.TOKEN_SECRET ?? "", (err, data) => {
        if (err) {
          res.status(401).send(err);
        } else {
          if (typeof data === "string") {
            let d = JSON.parse(data);
            res.status(d.meta.code ?? 401).json(d);
          } else {
            res.status(401).send("GET OK")

          }
        }
      })
      break;
    case "POST":
      await oauth.post(req.body.link, bl_secrets.TOKEN_VALUE ?? "", bl_secrets.TOKEN_SECRET ?? "", JSON.stringify(req.body.body), "application/json", (err, data) => {
        if (err) {
          res.status(401).send(err)

        } else {
          if (typeof data === "string") {
            let d = JSON.parse(data)
            res.status(d.meta.code ?? 401).json(d);

          } else {
            res.status(401).send("POST OK")

          }
        }
      })
      break;
    case "PUT":
      await oauth.put(req.body.link, bl_secrets.TOKEN_VALUE ?? "", bl_secrets.TOKEN_SECRET ?? "", JSON.stringify(req.body.body), "application/json", (err, data) => {
        console.log(req.body.body,err,data)
        if (err) {
          res.status(401).send(err)
        } else {
          if (typeof data === "string") {
            let d = JSON.parse(data)
            res.status(d.meta.code ?? 401).json(d);

          } else {
            res.status(401).send("PUT OK")

          }
        }
      })
      break;
    case "DELETE":
      await oauth.delete(req.body.link, bl_secrets.TOKEN_VALUE ?? "", bl_secrets.TOKEN_SECRET ?? "", (err, data) => {
        if (err) {
          res.statusCode = 401
          res.send(err)

        } else {
          if (typeof data === "string") {
            let d = JSON.parse(data)
            res.status(d.meta.code ?? 401).json(d);

          } else {
            res.status(401).send("DELETE OK")

          }
        }
      })
      break;
  }
}
export const config = {
  api: {
    responseLimit: false,
  },
}
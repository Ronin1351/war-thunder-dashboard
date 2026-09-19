// GET/PUT /api/lists - saved vehicle lists in a private Vercel Blob store.
// Setup: create a PRIVATE Blob store, connect it to this project, and add the
// LISTS_PASSPHRASE environment variable. See README "Saved lists".
import {get, put, list, BlobPreconditionFailedError} from '@vercel/blob';
import {createHandler} from './_lists-handler.js';

const MAIN = 'lists/main.json';
const backupPath = date => `lists/daily/${date}.json`;
const options = {access:'private', contentType:'application/json', addRandomSuffix:false, cacheControlMaxAge:60};

async function readText(pathname){
  const result = await get(pathname, {access:'private', useCache:false});
  if (!result || result.statusCode !== 200) return null;
  return {text: await new Response(result.stream).text(), etag: result.blob.etag};
}

const store = {
  read: () => readText(MAIN),
  async write(text, etag){
    try {
      const result = await put(MAIN, text, etag ? {...options, ifMatch: etag} : {...options, allowOverwrite: true});
      return {etag: result.etag};
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) throw Object.assign(new Error('conflict'), {code:'conflict'});
      throw error;
    }
  },
  async writeBackup(date, text){ await put(backupPath(date), text, {...options, allowOverwrite: true}); },
  async listBackups(){
    const {blobs} = await list({prefix:'lists/daily/', limit:1000});
    return blobs.map(blob => blob.pathname.slice('lists/daily/'.length, -'.json'.length)).sort().reverse();
  },
  async readBackup(date){ const result = await readText(backupPath(date)); return result ? result.text : null; }
};

export default createHandler({store, passphrase: process.env.LISTS_PASSPHRASE});

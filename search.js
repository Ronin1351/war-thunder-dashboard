(function(root){
  const normalize=value=>String(value??'').toLowerCase().replace(/\.blkx\b/g,'').replace(/[_-]+/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
  const fieldScore=(text,phrase,weight)=>{const value=normalize(text);if(!value)return -1;if(value===phrase)return weight+500;if(value.startsWith(phrase))return weight+350;if(` ${value} `.includes(` ${phrase} `))return weight+250;if(value.includes(phrase))return weight;return -1;};
  function searchParts(domain,record,relations={}){
    if(domain==='air')return {primary:[record.Weapon,record['Full Name']],identifiers:[String(record.File??'').replace(/\.blkx$/i,'')],related:(relations.carriers||[]).map(row=>row.Aircraft)};
    if(domain==='aircraft')return {primary:[record.Aircraft],identifiers:[record['Aircraft ID']],related:String(record.Guns??'').split(';').map(value=>value.trim())};
    if(domain==='ground')return {primary:[record.Vehicle],identifiers:[record['Vehicle ID']],related:[]};
    return {primary:[record.Weapon,record['In-Game Label (from files)']],identifiers:[],related:[record.Chambering]};
  }
  function searchScore(domain,record,query,relations={}){
    const phrase=normalize(query);if(!phrase)return 0;
    const parts=searchParts(domain,record,relations),fields=[...parts.primary.map(value=>[value,700]),...parts.identifiers.map(value=>[value,500]),...parts.related.map(value=>[value,250])];
    const terms=phrase.split(' ');let total=0;
    for(const term of terms){const best=Math.max(...fields.map(([value,weight])=>fieldScore(value,term,weight)));if(best<0)return -1;total+=best;}
    total+=Math.max(...fields.map(([value,weight])=>fieldScore(value,phrase,weight)),0);
    return total;
  }
  root.OrdnanceSearch={normalize,searchParts,searchScore};
})(globalThis);

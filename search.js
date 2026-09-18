(function(root){
  // Lower-case, strip accents, and turn every separator (- . / _ space etc.) into one space.
  // 'A-7E' -> 'a 7e', 'Pz.Kpfw. IV' -> 'pz kpfw iv', 'Sturmmörser' -> 'sturmmorser'.
  const normalize=value=>String(value??'').normalize('NFD').replace(/\p{M}+/gu,'').toLowerCase().replace(/\.blkx\b/g,'').replace(/[_-]+/g,' ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');

  // Separator-blind match, anchored at the start of a word so 'a7e' finds 'a 7e'
  // but 'e1' does not find 'type 1'. Returns 2 whole value, 1 prefix, 0 later word, -1 none.
  function compactMatch(value,phrase){
    const target=phrase.replace(/ /g,'');if(!target)return -1;
    const tokens=value.split(' ');
    for(let i=0;i<tokens.length;i++){const tail=tokens.slice(i).join('');if(tail.startsWith(target))return i>0?0:tail===target?2:1;}
    return -1;
  }

  const fieldScore=(text,phrase,weight)=>{
    const value=normalize(text);if(!value)return -1;
    let best=-1;
    if(value===phrase)best=weight+500;
    else if(value.startsWith(phrase))best=weight+350;
    else if(` ${value} `.includes(` ${phrase} `))best=weight+250;
    else if(value.includes(phrase))best=weight;
    const loose=compactMatch(value,phrase);
    if(loose>=0)best=Math.max(best,weight+[200,300,450][loose]);
    return best;
  };

  // Every term must hit some field; the whole phrase earns a bonus.
  function scoreFields(fields,phrase){
    if(!phrase)return 0;
    let total=0;
    for(const term of phrase.split(' ')){const best=Math.max(-1,...fields.map(([value,weight])=>fieldScore(value,term,weight)));if(best<0)return -1;total+=best;}
    total+=Math.max(0,...fields.map(([value,weight])=>fieldScore(value,phrase,weight)));
    return total;
  }

  function searchParts(domain,record,relations={}){
    if(domain==='air')return {primary:[record.Weapon,record['Full Name']],identifiers:[String(record.File??'').replace(/\.blkx$/i,'')],related:(relations.carriers||[]).map(row=>row.Aircraft)};
    if(domain==='aircraft')return {primary:[record.Aircraft],identifiers:[record['Aircraft ID']],related:String(record.Guns??'').split(';').map(value=>value.trim())};
    if(domain==='ground')return {primary:[record.Vehicle],identifiers:[record['Vehicle ID']],related:[]};
    return {primary:[record.Weapon,record['In-Game Label (from files)']],identifiers:[],related:[record.Chambering]};
  }
  function searchScore(domain,record,query,relations={}){
    const parts=searchParts(domain,record,relations);
    return scoreFields([...parts.primary.map(value=>[value,700]),...parts.identifiers.map(value=>[value,500]),...parts.related.map(value=>[value,250])],normalize(query));
  }
  // Generic scorer for simple pickers (the Brief): texts earlier in the list weigh more.
  function matchScore(texts,query){return scoreFields(texts.map((value,index)=>[value,Math.max(0,700-index*200)]),normalize(query));}

  root.OrdnanceSearch={normalize,compactMatch,searchParts,searchScore,matchScore};
})(globalThis);

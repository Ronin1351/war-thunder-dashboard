(function(root){
  const officialRules=[
    {match:/^us_m1a2(_|$)|^cn_m1a2t$/,total:19,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4809'},
    {match:/^us_m1_abrams$|^us_m1_ip_abrams$|^us_xm1/,total:23,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4807'},
    {match:/leopard_2(a4|a5|a6)|strv_121|christian_ii/,total:16,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4120'},
    {match:/pzkpfw_VI_ausf_(h1|e)|tiger.*(h1|e)|tigris|kungstiger/,total:28,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/3328'},
    {match:/m60a3_tts|m60a1_aos|m60a1_ariete/,total:17,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4707'},
    {match:/m_51/,total:8,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4704'},
    {match:/merkava_mk_3/,total:18,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/4719'},
    {match:/t_54_1947|t_54_1949|t_54_1951|type_59|ztz59|tiran_4/,total:21,label:'Official rack guidance',source:'https://wiki.warthunder.com/tips/8535'}
  ];
  function baselineTotal(guide){
    const full=Number(guide?.['Full Ammo Capacity']);if(!Number.isFinite(full)||full<=0)return null;
    const id=String(guide['Vehicle ID']||'');const official=officialRules.find(rule=>rule.match.test(id));
    if(official)return{total:Math.min(full,official.total),basis:official.label,source:official.source,confidence:'Vehicle-specific'};
    const caliber=Number(guide['Main Gun Caliber (mm)']);const unit=String(guide['Unit Class']||'');const protectedRounds=Number(guide['Protected Rack Rounds']);
    if(full<=20)return{total:full,basis:'Full capacity is 20 rounds or fewer',source:'Datamine capacity',confidence:'Calculated baseline'};
    if(unit==='exp_SPAA'||(Number.isFinite(caliber)&&caliber<40))return{total:full,basis:'Autocannon or SPAA ammunition',source:'Datamine capacity',confidence:'Calculated baseline'};
    let target=Number.isFinite(caliber)&&caliber>=140?15:20;
    if(Number.isFinite(protectedRounds)&&protectedRounds>0&&protectedRounds<full)target=Math.min(target,protectedRounds);
    return{total:Math.max(1,Math.min(full,target)),basis:protectedRounds>0?'Conservative limit within protected storage':'Conservative gameplay baseline',source:'Calculated from capacity and rack data',confidence:'Calculated baseline'};
  }
  function allocate(total,rows){
    if(!Number.isFinite(total)||total<=0||!rows.length)return[];
    const weights=rows.map(row=>Number(row['Share of Load'])||Number(row['Take This Many'])||0),sum=weights.reduce((a,b)=>a+b,0)||rows.length;
    const raw=weights.map(value=>total*value/sum),counts=raw.map(Math.floor);let left=total-counts.reduce((a,b)=>a+b,0);
    raw.map((value,index)=>({index,remainder:value-counts[index]})).sort((a,b)=>b.remainder-a.remainder).slice(0,left).forEach(item=>counts[item.index]++);
    return rows.map((row,index)=>({...row,'Revised Quantity':counts[index]}));
  }
  root.OrdnanceRecommendations={baselineTotal,allocate,officialRules};
})(globalThis);

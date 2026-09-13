"""Rebuild the JSON snapshot: python scripts/import_workbook.py path/to/workbook.xlsx"""
import sys,json,pathlib,datetime
import openpyxl
source=pathlib.Path(sys.argv[1]);w=openpyxl.load_workbook(source,data_only=True)
def rows(name):
    values=list(w[name].values)
    return [dict(zip(values[0],row)) for row in values[1:] if any(v is not None for v in row)]
notes=[list(r) for r in w['READ ME'].values if any(v is not None for v in r)]
snapshot=next((r[1] for r in notes if r[0]=='Snapshot date'),None)
if isinstance(snapshot,(datetime.date,datetime.datetime)):snapshot=snapshot.isoformat()
data={'meta':{'title':'War Thunder Guided Weapons','snapshot':snapshot,'sourceWorkbook':source.name,'sourceRepository':'https://github.com/gszabi99/War-Thunder-Datamine'},'weapons':rows('All Weapons'),'carriers':rows('Carriers'),'envelopes':rows('Launch Envelope'),'dictionary':dict(list(w['Field Dictionary'].values)[1:]),'readme':notes}
assert len({r['File'] for r in data['weapons']})==len(data['weapons']),'Duplicate file IDs'
path=pathlib.Path(__file__).resolve().parents[1]/'data'/'weapons.json'
path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'),default=str),encoding='utf-8')
print(f"Saved {len(data['weapons'])} weapons to {path}")

"""Independent validator for the Bb trumpet CEQ-3 sight-reading set (reads the MusicXML only)."""
import glob, os, sys, xml.etree.ElementTree as ET
from collections import Counter
D='bb-trumpet'
STEP={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
LO,HI=62,81  # D4..A5 written
ALLOWED_NOTES={('whole',0,None),('half',1,None),('half',0,None),('quarter',0,None),('quarter',1,None),('eighth',0,None),('eighth',0,'3:2')}
ALLOWED_RESTS={('half',0),('quarter',0),('quarter',1),('eighth',0),('eighth',1),('16th',0)}
DUR={'whole':4,'half':2,'quarter':1,'eighth':.5,'16th':.25}
KEYS={(0,'major'):'C',(-1,'major'):'F',(-2,'major'):'Bb',(-3,'major'):'Eb',(1,'major'):'G',(2,'major'):'D',
      (0,'minor'):'A',(-2,'minor'):'G',(-3,'minor'):'C',(1,'minor'):'E',(2,'minor'):'B'}
TONIC_PC={'C':0,'F':5,'Bb':10,'Eb':3,'G':7,'D':2,'A':9,'E':4,'B':11}
ALLOWED_ARTIC={'staccato','accent'}
def midi(p):
    a=p.find('alter'); return 12*(int(p.find('octave').text)+1)+STEP[p.find('step').text]+(int(float(a.text)) if a is not None else 0)
NAMES=['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B']
def nm(m): return NAMES[m%12]+str(m//12-1)
errors=0; starts=Counter(); summary=[]; combos=Counter()
files=sorted(glob.glob(os.path.join(D,'*.musicxml')))
for f in files:
    err=[]; r=ET.parse(f).getroot()
    meas=r.findall('./part/measure')
    if len(meas)!=16: err.append('measures=%d'%len(meas))
    div=int(r.find('.//divisions').text)
    k=r.find('.//key'); kk=(int(k.find('fifths').text),k.find('mode').text)
    if kk not in KEYS: err.append('key %s'%(kk,))
    t=r.find('.//time'); beats,bt=int(t.find('beats').text),int(t.find('beat-type').text)
    ts='cut' if t.get('symbol')=='cut' else '%d/%d'%(beats,bt)
    if ts not in ('2/4','3/4','4/4','cut') or (ts=='cut' and (beats,bt)!=(2,2)): err.append('time %s'%ts)
    combos[(KEYS.get(kk),kk[1],ts)]+=1
    barq=beats*4/bt
    if len(r.findall('.//transpose'))!=1: err.append('no transpose')
    pitches=[]; prev=None
    for m in meas:
        tot=0; trip_run=0
        for n in m.findall('note'):
            typ=n.find('type'); typ=typ.text if typ is not None else None
            dots=len(n.findall('dot')); tm=n.find('time-modification')
            tup=None if tm is None else '%s:%s'%(tm.find('actual-notes').text,tm.find('normal-notes').text)
            dur=int(n.find('duration').text)/div
            rest=n.find('rest')
            if rest is not None:
                if rest.get('measure')=='yes': err.append('m%s whole-bar rest'%m.get('number'))
                if (typ,dots) not in ALLOWED_RESTS or tup: err.append('m%s rest %s dots=%d %s'%(m.get('number'),typ,dots,tup))
            else:
                if (typ,dots,tup) not in ALLOWED_NOTES: err.append('m%s note %s dots=%d %s'%(m.get('number'),typ,dots,tup))
            exp=DUR.get(typ,0)*(1.5 if dots else 1)*(2/3 if tup else 1)
            if abs(exp-dur)>1e-6: err.append('m%s duration mismatch'%m.get('number'))
            # triplet groups must be 3 quavers filling one crotchet beat
            if tup:
                if trip_run==0 and abs((tot % 1))>1e-6: err.append('m%s triplet off-beat'%m.get('number'))
                trip_run=(trip_run+1)%3
            elif trip_run: err.append('m%s incomplete triplet'%m.get('number'))
            tot+=dur
            no=n.find('notations')
            if no is not None:
                for a in no.findall('articulations/*'):
                    if a.tag not in ALLOWED_ARTIC: err.append('m%s articulation %s'%(m.get('number'),a.tag))
                if no.find('ornaments') is not None or no.find('fermata') is not None: err.append('ornament/fermata')
            if rest is None:
                mm=midi(n.find('pitch'))
                if not (LO<=mm<=HI): err.append('m%s range %s'%(m.get('number'),nm(mm)))
                tied_stop=any(x.get('type')=='stop' for x in n.findall('tie'))
                if prev is not None:
                    if abs(mm-prev)>7: err.append('m%s leap %s->%s (%d st)'%(m.get('number'),nm(prev),nm(mm),abs(mm-prev)))
                    if tied_stop and mm!=prev: err.append('m%s tie pitch mismatch'%m.get('number'))
                prev=mm; pitches.append(mm)
        if abs(tot-barq)>1e-6: err.append('m%s length %.3f'%(m.get('number'),tot))
    if r.find('.//tenuto') is not None: err.append('tenuto present')
    open_slur=False
    for n in r.iter('note'):
        for s in n.findall('notations/slur'):
            if n.find('rest') is not None: err.append('slur on rest')
            if s.get('type')=='start':
                if open_slur: err.append('nested/unclosed slur')
                open_slur=True
            elif s.get('type')=='stop':
                if not open_slur: err.append('slur stop without start')
                open_slur=False
    if open_slur: err.append('unclosed slur')
    tonic=TONIC_PC[KEYS.get(kk,'C')]
    if pitches and pitches[-1]%12!=tonic: err.append('does not end on tonic (%s)'%nm(pitches[-1]))
    if pitches: starts[(pitches[0]-tonic)%12]+=1
    has_rest=any(n.find('rest') is not None for n in r.iter('note'))
    summary.append((os.path.basename(f), nm(min(pitches)), nm(max(pitches)), max(abs(a-b) for a,b in zip(pitches,pitches[1:]))))
    if err:
        errors+=1; print('FAIL',os.path.basename(f)); [print('   ',e) for e in err[:12]]
print('files:',len(files),'failing:',errors)
allp=[]
lo=min(s[1] for s in summary); 
print('overall written range used: lowest/highest per file ok within D4-A5; max leap overall:',max(s[3] for s in summary),'semitones')
print('start note (semitones above tonic) distribution:',dict(starts))
print('key/time combos covered:',len(combos))
sys.exit(1 if errors else 0)

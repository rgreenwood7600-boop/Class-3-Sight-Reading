"""Generate 50 CEQ-3 (Easy) sight-reading pieces for Bb trumpet (written pitch).
Constraints (per user): 16 bars; keys C F Bb Eb G D major, A G C E B minor; 2/4 3/4 4/4 cut;
notes: semibreve, minim, dotted minim, crotchet, dotted crotchet, quaver, quaver triplet; ties ok;
rests: minim, crotchet, dotted crotchet, quaver (dotted quaver/semiquaver rests permitted but unused);
written range D4-A5; max leap perfect 5th; accidentals allowed; start varies, end on tonic;
articulation: staccato, slur, accent, dynamics (no tenuto)."""
import random, itertools, os, json, sys

DIV = 12  # divisions per crotchet
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bb-trumpet')
LO, HI = 62, 81  # D4 .. A5 written
MAXLEAP = 7

TOK = {  # name: (divs, kind, type, dots, triplet)
 'S':(48,'n','whole',0,False),'dM':(36,'n','half',1,False),'M':(24,'n','half',0,False),
 'dC':(18,'n','quarter',1,False),'C':(12,'n','quarter',0,False),'Q':(6,'n','eighth',0,False),
 'T':(4,'n','eighth',0,True),
 'mr':(24,'r','half',0,False),'dcr':(18,'r','quarter',1,False),'cr':(12,'r','quarter',0,False),
 'qr':(6,'r','eighth',0,False)}

LETTERS = 'CDEFGAB'; NAT = [0,2,4,5,7,9,11]
KEYS = [  # name, tonic letter, tonic alter, fifths, mode
 ('C major','C',0,0,'major'),('F major','F',0,-1,'major'),('Bb major','B',-1,-2,'major'),
 ('Eb major','E',-1,-3,'major'),('G major','G',0,1,'major'),('D major','D',0,2,'major'),
 ('A minor','A',0,0,'minor'),('G minor','G',0,-2,'minor'),('C minor','C',0,-3,'minor'),
 ('E minor','E',0,1,'minor'),('B minor','B',0,2,'minor')]
TIMES = [('2/4',2,4,None),('3/4',3,4,None),('4/4',4,4,None),('2/2',2,2,'cut')]
TEMPI = {'2/4':[('Allegretto',100),('Moderato',92),('March tempo',104)],
         '3/4':[('Andante',84),('Moderato',96),('Tempo di valse',108)],
         '4/4':[('Moderato',92),('Andante',80),('Allegretto',104)],
         '2/2':[('Alla breve',60),('March tempo',66),('Moderato',56)]}

def ks_alter(fifths):
    a = {l:0 for l in LETTERS}
    if fifths>0:
        for l in 'FCGDAEB'[:fifths]: a[l]=1
    else:
        for l in 'BEADGCF'[:-fifths]: a[l]=-1
    return a

class Key:
    def __init__(s, spec, tonic_oct):
        s.name, s.tl, s.ta, s.fifths, s.mode = spec
        s.ti = LETTERS.index(s.tl); s.toct = tonic_oct; s.ks = ks_alter(s.fifths)
    def spell(s, d, chrom=0):
        li = s.ti + d; L = LETTERS[li % 7]; octv = s.toct + li // 7
        alt = s.ks[L] + chrom
        return L, alt, octv, 12*(octv+1) + NAT[LETTERS.index(L)] + alt
    def midi(s, d, chrom=0): return s.spell(d, chrom)[3]

def tonic_octaves(spec):
    k = Key(spec, 4); res=[]
    for o in (3,4,5):
        kk = Key(spec,o); m = kk.midi(0)
        if LO <= m <= HI: res.append(o)
    return res

# ---------- rhythm ----------
BEAT1 = [(['C'],5),(['Q','Q'],4),(['T','T','T'],0.9),(['qr','Q'],0.6),(['cr'],0.35)]
BEAT2 = [(['M'],2),(['dC','Q'],2.4),(['Q','C','Q'],0.5),(['dcr','Q'],0.35)]
def wchoice(rng, items):
    tot = sum(w for _,w in items); x = rng.random()*tot
    for it,w in items:
        x -= w
        if x <= 0: return it
    return items[-1][0]

def normal_bar(rng, beats, cut, allow_rest=True):
    if beats == 4:
        splits = [([1,1,1,1],3),([2,1,1],2),([1,1,2],2),([2,2],1.5),([3,1],0.5)]
    elif beats == 3:
        splits = [([1,1,1],3),([2,1],2),([1,2],1.5),([3],0.4)]
    else:
        splits = [([1,1],3),([2],1)]
    for _ in range(100):
        sp = wchoice(rng, splits); bar=[]
        for c in sp:
            if c==1: bar += wchoice(rng, BEAT1)
            elif c==2: bar += wchoice(rng, BEAT2)
            else: bar += ['dM']
        rests = sum(1 for t in bar if TOK[t][1]=='r'); trip = bar.count('T')//3
        if not allow_rest and rests: continue
        if rests>1 or trip>1: continue
        if sum(1 for t in bar if TOK[t][1]=='n')==0: continue
        return bar
    return ['C']*beats if beats!=2 or True else None

def end_bar(rng, beats, final=False):
    if final:
        return {4:[['S'],['dM','cr'],['M','mr']],3:[['dM']],2:[['M']]}[beats][0] if beats!=4 else \
               wchoice(rng,[(['S'],3),(['M','mr'],1),(['dM','cr'],1)])
    if beats==4: return wchoice(rng,[(['M','mr'],2),(['dM','cr'],2),(['C','C','M'],1.5),(['dC','Q','M'],1),(['S'],0.6)])
    if beats==3: return wchoice(rng,[(['dM'],2),(['M','cr'],2),(['C','M'],1.5)])
    return wchoice(rng,[(['M'],2),(['C','cr'],2),(['Q','Q','C'],1)])

def bar_len(beats, beat_type): return beats*DIV*(4//beat_type)

# ---------- pitch ----------
STEPS = [(-1,3.2),(1,3.2),(-2,1.2),(2,1.2),(-3,0.45),(3,0.45),(-4,0.25),(4,0.25),(0,0.7)]
def ok_interval(a, b):
    s = abs(a-b); return s <= MAXLEAP and s != 6

def gen_phrase(rng, key, prev_d, n, target, dmin, dmax, first=None, ties=()):
    """Return n degree values; last == target. ties: indices that must repeat previous."""
    for _ in range(500):
        ds=[]; cur=prev_d; ok=True; lastleap=0; rep=0
        for i in range(n):
            rem = n-1-i
            if i==0 and first is not None: nd = first
            elif i in ties: nd = cur
            elif rem==0: nd = target
            else:
                cands=[]
                for st,w in STEPS:
                    nd = cur+st
                    if not (dmin<=nd<=dmax): continue
                    if abs(nd-target) > 2*rem+1: continue
                    if cur is not None and not ok_interval(key.midi(cur), key.midi(nd)): continue
                    if st==0 and rep>=1: continue
                    if lastleap>=2 and st!=0 and (st>0)==(lastleap>0): w*=0.25
                    if lastleap>=2 and st!=0 and (st>0)!=(lastleap>0) and abs(st)==1: w*=2.5
                    if lastleap<=-2 and st!=0 and (st>0)==(lastleap>0): w*=0.25
                    if lastleap<=-2 and st>0 and abs(st)==1: w*=2.5
                    if rem<=3 and abs(nd-target)<abs(cur-target): w*=2
                    cands.append((nd,w))
                if not cands: ok=False; break
                nd = wchoice(rng, cands)
            if cur is not None and not ok_interval(key.midi(cur), key.midi(nd)): ok=False; break
            if not (dmin<=nd<=dmax): ok=False; break
            if cur is not None:
                st = nd-cur; lastleap = st if abs(st)>=2 else 0
                rep = rep+1 if st==0 else 0
            ds.append(nd); cur=nd
        if ok: return ds
    return None

def deg_bounds(key):
    ds=[d for d in range(-14,15) if LO <= key.midi(d) <= HI]
    return min(ds), max(ds)

# ---------- build piece ----------
def build(idx, keyspec, tsig, seed, start_choice):
    rng = random.Random(seed)
    tname, beats, btype, sym = tsig
    cut = sym=='cut'
    qbeats = beats*(4//btype)  # crotchet beats per bar
    octs = tonic_octaves(keyspec)
    key = Key(keyspec, rng.choice(octs))
    dmin, dmax = deg_bounds(key)
    # rhythm
    bars = [None]*16
    for b in range(16):
        if b==15: bars[b]=end_bar(rng,qbeats,final=True)
        elif b in (3,7,11): bars[b]=end_bar(rng,qbeats)
        elif b in (8,9): bars[b]=list(bars[b-8])
        else: bars[b]=normal_bar(rng,qbeats,cut, allow_rest=(b not in (0,14)))
    # ensure at least one rest in piece
    if not any(TOK[t][1]=='r' for bar in bars for t in bar):
        if qbeats==4: bars[3]=['M','mr']
        elif qbeats==3: bars[3]=['M','cr']
        else: bars[3]=['C','cr']
    # flatten note events
    events=[]  # dict(bar, tok)
    for b,bar in enumerate(bars):
        for t in bar: events.append({'bar':b,'tok':t,'rest':TOK[t][1]=='r'})
    # ties: tie last crotchet/minim note of bar to first crotchet of next (not phrase ends)
    for i in range(len(events)-1):
        e,f = events[i],events[i+1]
        if e['bar']!=f['bar'] and e['bar'] not in (3,7,11,14,15,7) and f['bar'] not in (8,9,15) and \
           not e['rest'] and not f['rest'] and e['tok'] in ('C','M') and f['tok'] in ('C','Q') and rng.random()<0.18:
            e['tie_start']=True; f['tie_stop']=True
    notes=[e for e in events if not e['rest']]
    # phrases by bars
    phr_bounds=[(0,3),(4,7),(8,11),(12,15)]
    targets=[rng.choice([4,1,2,4]), rng.choice([4,0,4,7]), rng.choice([2,4,4]), 0]
    targets=[t if dmin<=t<=dmax else (t-7 if dmin<=t-7<=dmax else 0) for t in targets]
    if not (dmin<=4<=dmax) and targets[1]==4: targets[1]=-3 if dmin<=-3 else 0
    prev=None; degs=[]
    rep_map={}
    for pi,(b0,b1) in enumerate(phr_bounds):
        pn=[e for e in notes if b0<=e['bar']<=b1]
        ties=set(i for i,e in enumerate(pn) if e.get('tie_stop') and i>0)
        first=None
        if pi==0: first=start_choice
        if pi==2:
            # bars 9-10 repeat bars 1-2 pitches
            src=[degs[i] for i,e in enumerate(notes) if e['bar'] in (0,1)]
            k=len(src)
            if not ok_interval(key.midi(prev), key.midi(src[0])): return None
            rest=gen_phrase(rng,key,src[-1],len(pn)-k,targets[pi],dmin,dmax,
                            ties=set(i-k for i in ties if i>=k))
            if rest is None: return None
            ds=src+rest
        else:
            ds=gen_phrase(rng,key,prev,len(pn),targets[pi],dmin,dmax,first=first,ties=ties)
            if ds is None: return None
        degs+=ds; prev=ds[-1]
    for e,d in zip(notes,degs): e['deg']=d; e['chrom']=0
    # chromatic alterations
    for i,e in enumerate(notes):
        d=e['deg']; nxt=notes[i+1]['deg'] if i+1<len(notes) else None
        prv=notes[i-1]['deg'] if i>0 else None
        if e.get('tie_start') or e.get('tie_stop'): continue
        if key.mode=='minor':
            if d%7==6 and nxt is not None and nxt==d+1: e['chrom']=1        # leading note
            elif d%7==5 and nxt is not None and nxt==d+1 and i+2<len(notes) and notes[i+2]['deg']==d+2:
                e['chrom']=1  # melodic minor ascending 6-7-8
        else:
            if d%7==3 and nxt==d+1 and prv==d-1 and rng.random()<0.5: e['chrom']=1   # #4 passing
            elif d%7==6 and prv==d+1 and nxt==d-1 and rng.random()<0.5: e['chrom']=-1  # b7 passing down
    # minor: if 6 raised then 7 must be raised (already, since 6-7-8 requires 7->8)
    def midi_of(e): return key.midi(e['deg'],e['chrom'])
    for i in range(1,len(notes)):
        if not ok_interval(midi_of(notes[i-1]),midi_of(notes[i])) or abs(midi_of(notes[i-1])-midi_of(notes[i]))==3 and abs(notes[i]['deg']-notes[i-1]['deg'])==1:
            # revert alterations causing bad intervals (aug 2nd etc.)
            for e in (notes[i-1],notes[i]):
                if e['chrom'] and not (key.mode=='minor' and e['deg']%7==6): e['chrom']=0
            if not ok_interval(midi_of(notes[i-1]),midi_of(notes[i])): return None
            if abs(midi_of(notes[i-1])-midi_of(notes[i]))==3 and abs(notes[i]['deg']-notes[i-1]['deg'])==1: return None
    for e in notes:
        if not (LO<=midi_of(e)<=HI): return None
    # musical sanity: avoid too many repeated notes / triplets
    trip=sum(1 for e in events if e['tok']=='T')//3
    if trip>4: return None
    if key.mode=='minor' and not any(e['chrom'] for e in notes): return None
    return dict(key=key,bars=bars,events=events,notes=notes,tsig=tsig,rng=rng,qbeats=qbeats,cut=cut)

# ---------- articulation / XML ----------
def decorate(p):
    rng=p['rng']; ev=p['events']
    # slurs on stepwise quaver pairs / triplets, staccato on detached passages
    stacc_phr = rng.choice([1,3,(1,3)]) if rng.random()<0.85 else ()
    stacc_phr = stacc_phr if isinstance(stacc_phr,tuple) else (stacc_phr,)
    i=0
    while i<len(ev):
        e=ev[i]
        if e['tok']=='T':  # e is always the first note of a triplet group here
            if rng.random()<0.6: ev[i]['slur']='start'; ev[i+2]['slur']='stop'
            i+=3; continue
        if e['tok'] in ('Q','dC') and i+1<len(ev) and not e['rest'] and not ev[i+1]['rest'] and \
           ev[i+1]['tok'] in ('Q','C','M','dC') and ev[i+1]['bar']==e['bar'] and 'deg' in e and 'deg' in ev[i+1] and \
           abs(e['deg']-ev[i+1]['deg'])==1 and not e.get('tie_start') and not ev[i+1].get('tie_start') and rng.random()<0.55:
            e['slur']='start'; ev[i+1]['slur']='stop'; i+=2; continue
        i+=1
    for e in ev:
        if e['rest'] or 'slur' in e or e.get('tie_start') or e.get('tie_stop'): continue
        ph=e['bar']//4
        if ph in stacc_phr and e['tok'] in ('C','Q') and rng.random()<0.6: e['stacc']=True
    # accents
    for b in range(16):
        first=[e for e in ev if e['bar']==b]
        if first and not first[0]['rest'] and not first[0].get('tie_stop') and b in (4,12,13) and rng.random()<0.45:
            first[0]['accent']=True
    last=[e for e in ev if not e['rest']][-1]
    if rng.random()<0.3: last['accent']=True
    # dynamics
    d0=rng.choice(['mp','mf','mf','f'])
    d2={'mp':'mf','mf':rng.choice(['f','mp']),'f':'mp'}[d0]
    p['dyn']={0:d0, 8:d2}
    p['dyn'][12]= 'mf' if d2!='mf' else rng.choice(['f','mp'])
    p['wedge']=rng.choice([('crescendo',13,14),('diminuendo',14,15),('crescendo',5,6)])

def xml_note(e,key,divs_extra):
    t=TOK[e['tok']]; out=['<note>']
    if e['rest']: out.append('<rest/>')
    else:
        L,alt,o,_=key.spell(e['deg'],e['chrom'])
        out.append('<pitch><step>%s</step>%s<octave>%d</octave></pitch>'%(L,'<alter>%d</alter>'%alt if alt else '',o))
    out.append('<duration>%d</duration>'%t[0])
    if e.get('tie_stop'): out.append('<tie type="stop"/>')
    if e.get('tie_start'): out.append('<tie type="start"/>')
    out.append('<voice>1</voice><type>%s</type>'%t[2])
    out += ['<dot/>']*t[3]
    if e.get('acc'): out.append('<accidental>%s</accidental>'%e['acc'])
    if t[4]: out.append('<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>')
    for b in e.get('beam',[]): out.append('<beam number="1">%s</beam>'%b)
    nots=[]
    if e.get('tie_stop'): nots.append('<tied type="stop"/>')
    if e.get('tie_start'): nots.append('<tied type="start"/>')
    if e.get('tup'): nots.append('<tuplet type="%s" bracket="no"/>'%e['tup'])
    if e.get('slur'): nots.append('<slur type="%s" number="1"/>'%e['slur'])
    arts=[]
    if e.get('stacc'): arts.append('<staccato/>')
    if e.get('accent'): arts.append('<accent/>')
    if arts: nots.append('<articulations>%s</articulations>'%''.join(arts))
    if nots: out.append('<notations>%s</notations>'%''.join(nots))
    out.append('</note>'); return ''.join(out)

def to_xml(p, title, tempo):
    key=p['key']; tname,beats,btype,sym=p['tsig']; ev=p['events']
    # beams per crotchet beat; triplet markers; accidentals
    for b in range(16):
        bev=[e for e in ev if e['bar']==b]; pos=0
        groups={}
        for e in bev:
            e['pos']=pos; pos+=TOK[e['tok']][0]
            if TOK[e['tok']][2]=='eighth' and not e['rest']: groups.setdefault(e['pos']//DIV,[]).append(e)
        for g in groups.values():
            # only beam contiguous quavers inside the beat
            if len(g)>=2 and all(TOK[x['tok']][0] in (4,6) for x in g) and sum(TOK[x['tok']][0] for x in g)==DIV:
                g[0]['beam']=['begin']; g[-1]['beam']=['end']
                for x in g[1:-1]: x['beam']=['continue']
        trip=[e for e in bev if e['tok']=='T']
        for j in range(0,len(trip),3): trip[j]['tup']='start'; trip[j+2]['tup']='stop'
        state={}
        for e in bev:
            if e['rest']: continue
            L,alt,o,_=key.spell(e['deg'],e['chrom'])
            cur=state.get((L,o),key.ks[L])
            if e.get('tie_stop'): state[(L,o)]=alt; continue
            if alt!=cur:
                e['acc']={1:'sharp',-1:'flat',0:'natural'}[alt]; state[(L,o)]=alt
    parts=['<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
      '<score-partwise version="4.0"><work><work-title>%s</work-title></work>'%title,
      '<identification><encoding><software>CEQ-3 sight-reading generator</software></encoding></identification>',
      '<part-list><score-part id="P1"><part-name>Trumpet in Bb</part-name><part-abbreviation>Tpt.</part-abbreviation>',
      '<score-instrument id="P1-I1"><instrument-name>Trumpet in Bb</instrument-name></score-instrument>',
      '<midi-instrument id="P1-I1"><midi-program>57</midi-program></midi-instrument></score-part></part-list><part id="P1">']
    def direction(inner, placement='below', sound=''):
        return '<direction placement="%s"><direction-type>%s</direction-type>%s</direction>'%(placement,inner,sound)
    for b in range(16):
        parts.append('<measure number="%d">'%(b+1))
        if b==0:
            parts.append('<attributes><divisions>%d</divisions><key><fifths>%d</fifths><mode>%s</mode></key>'%(DIV,key.fifths,key.mode)
              +'<time%s><beats>%d</beats><beat-type>%d</beat-type></time>'%(' symbol="cut"' if sym=='cut' else '',beats,btype)
              +'<clef><sign>G</sign><line>2</line></clef><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>')
            parts.append(direction('<words font-weight="bold">%s</words><metronome><beat-unit>%s</beat-unit><per-minute>%d</per-minute></metronome>'%(tempo[0],'half' if sym=='cut' else 'quarter',tempo[1]),'above','<sound tempo="%d"/>'%(tempo[1]*(2 if sym=='cut' else 1))))
        if b in p['dyn']:
            parts.append(direction('<dynamics><%s/></dynamics>'%p['dyn'][b]))
        w=p['wedge']
        if b==w[1]-1: parts.append(direction('<wedge type="%s"/>'%w[0]))
        for e in [e for e in ev if e['bar']==b]:
            parts.append(xml_note(e,key,None))
        if b==w[2]-1: parts.append(direction('<wedge type="stop"/>'))
        if b==15: parts.append('<barline location="right"><bar-style>light-heavy</bar-style></barline>')
        parts.append('</measure>')
    parts.append('</part></score-partwise>')
    return '\n'.join(parts)

def main():
    combos=list(itertools.product(range(len(KEYS)),range(len(TIMES))))
    rng=random.Random(2026)
    extra=rng.sample(combos,6); allc=combos+extra; rng.shuffle(allc)
    starts_cycle=[0,4,2,-3,7,4,2,0,-1,4]
    os.makedirs(OUT,exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.musicxml'): os.remove(os.path.join(OUT,f))
    manifest=[]
    for i,(ki,ti) in enumerate(allc):
        keyspec=KEYS[ki]; tsig=TIMES[ti]; p=None; seed=1000*i
        sc=starts_cycle[i%len(starts_cycle)]
        tries=0
        while p is None:
            tries+=1; seed+=1
            k=Key(keyspec,random.Random(seed).choice(tonic_octaves(keyspec)))
            dmin,dmax=deg_bounds(k)
            s=sc if dmin<=sc<=dmax else [x for x in (4,2,-3,0) if dmin<=x<=dmax][0]
            p=build(i,keyspec,tsig,seed,s)
        decorate(p)
        tempo=random.Random(seed).choice(TEMPI[tsig[0]])
        title="Sight-Reading No. %d (%s, %s)"%(i+1,keyspec[0],'cut time' if tsig[3] else tsig[0])
        xml=to_xml(p,title,tempo)
        fn='Bb Trumpet %02d - %s - %s.musicxml'%(i+1,keyspec[0],'cut time' if tsig[3] else tsig[0].replace('/','-'))
        open(os.path.join(OUT,fn),'w').write(xml)
        manifest.append(dict(n=i+1,file=fn,key=keyspec[0],time='cut' if tsig[3] else tsig[0],seed=seed,tempo=tempo[0]))
    json.dump(manifest,open(os.path.join(OUT,'manifest.json'),'w'),indent=1)
    print('wrote',len(manifest))
main()

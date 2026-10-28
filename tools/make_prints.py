"""Generate flat, rectangular-slot starter meshes. Millimetres; no dependencies.
CAD and mesh checks do not establish physical fit or print strength.
"""
from pathlib import Path
import struct, math, collections
OUT=Path(__file__).resolve().parents[1]/'assets'/'prints'
OUT.mkdir(parents=True,exist_ok=True)

def plate(name,w,h,z,holes):
    xs=sorted(set([-w/2,w/2]+[x for a,b,c,d in holes for x in (a,c)]))
    ys=sorted(set([-h/2,h/2]+[y for a,b,c,d in holes for y in (b,d)]))
    cells=set()
    for i in range(len(xs)-1):
        for j in range(len(ys)-1):
            x,y=(xs[i]+xs[i+1])/2,(ys[j]+ys[j+1])/2
            if not any(a<x<c and b<y<d for a,b,c,d in holes):cells.add((i,j))
    tris=[]
    def quad(a,b,c,d): tris.extend([(a,b,c),(a,c,d)])
    for i,j in sorted(cells):
        x,X,y,Y=xs[i],xs[i+1],ys[j],ys[j+1]
        quad((x,y,z),(X,y,z),(X,Y,z),(x,Y,z))
        quad((x,Y,0),(X,Y,0),(X,y,0),(x,y,0))
        if (i-1,j) not in cells:quad((x,y,0),(x,y,z),(x,Y,z),(x,Y,0))
        if (i+1,j) not in cells:quad((X,Y,0),(X,Y,z),(X,y,z),(X,y,0))
        if (i,j-1) not in cells:quad((X,y,0),(X,y,z),(x,y,z),(x,y,0))
        if (i,j+1) not in cells:quad((x,Y,0),(x,Y,z),(X,Y,z),(X,Y,0))
    edges=collections.Counter()
    vol=0
    for a,b,c in tris:
        for u,v in ((a,b),(b,c),(c,a)):edges[tuple(sorted((u,v)))]+=1
        vol+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6
    assert set(edges.values())=={2},(name,'non-manifold edge')
    expected=sum((xs[i+1]-xs[i])*(ys[j+1]-ys[j])*z for i,j in cells)
    assert abs(vol-expected)<0.001,(name,vol,expected)
    data=bytearray(b'Robotics Fieldbook maker edition; mm; unprinted prototype'.ljust(80,b' '))+struct.pack('<I',len(tris))
    for a,b,c in tris:
        u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];l=math.sqrt(sum(t*t for t in n));n=[t/l for t in n]
        data+=struct.pack('<12fH',*n,*a,*b,*c,0)
    (OUT/name).write_bytes(data)
    print(f'{name}: {len(tris)} triangles; manifold edges; volume {vol:.2f} mm3')

def slot(x,y,w,h):return (x-w/2,y-h/2,x+w/2,y+h/2)
# Four open-edge slots, increasing left-to-right. Gauge is for slot clearance.
plate('clearance-strip.stl',40,20,4,[slot(x,7,w,6) for x,w in zip([-15,-5,5,15],[2.8,3,3.2,3.4])])
# T-shaped deck: a narrow rear clears the wheels. Ties wrap over its edges.
holes=[(-60,-80,-45,-10),(45,-80,60,-10)]
holes += [slot(x,y,3.4,12) for x in [-25,25] for y in [-58,-15]]
holes += [slot(x,55,3.6,8) for x in [-5.25,5.25]]
holes += [slot(x,y,3.4,12) for x in [-28,28] for y in [12,32]]
plate('rover-deck.stl',120,160,4,holes)
for t in (1,2,4,8):plate(f'caster-spacer-{t}mm.stl',24,24,t,[slot(x,0,3.6,8) for x in [-5.25,5.25]])

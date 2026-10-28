"""Generate the round-fit exercise meshes in millimetres (requires numpy/scipy).
Closed mesh/volume checks validate geometry only, not physical fit or accuracy.
"""
from pathlib import Path
from collections import Counter
import math, struct
import numpy as np
from scipy.spatial import Delaunay
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/prints'
OUT.mkdir(parents=True,exist_ok=True)
N=96

def save(name, tris, expected):
    edges=Counter(); directed=Counter(); volume=0.0
    for a,b,c in tris:
        for u,v in ((a,b),(b,c),(c,a)):
            edges[tuple(sorted((u,v)))]+=1;directed[(u,v)]+=1
        volume+=np.dot(a,np.cross(b,c))/6
    assert set(edges.values())=={2},(name,'open/non-manifold edges')
    assert all(directed[(u,v)]==directed[(v,u)]==1 for u,v in edges),(name,'inconsistent normals')
    assert abs(volume-expected)<1e-6,(name,volume,expected)
    data=bytearray(b'Robotics Fieldbook: round fit exercise; mm; unprinted prototype'.ljust(80,b' '))+struct.pack('<I',len(tris))
    for a,b,c in tris:
        normal=np.cross(np.subtract(b,a),np.subtract(c,a));normal=normal/np.linalg.norm(normal)
        data+=struct.pack('<12fH',*normal,*a,*b,*c,0)
    (OUT/name).write_bytes(data)
    bounds=[(min(v[i] for t in tris for v in t),max(v[i] for t in tris for v in t)) for i in range(3)]
    print(name, 'triangles',len(tris),'bounds',bounds,'closed; consistent normals; volume',round(volume,3))

def ring(x,y,r,z=0):return [(x+r*math.cos(2*math.pi*i/N),y+r*math.sin(2*math.pi*i/N),z) for i in range(N)]
def area(poly):return sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))/2

def coupon():
    outer=[(-30,-15),(30,-15),(30,12),(27,15),(-30,15)]
    holes=[(x,7.5,d/2) for x,d in zip([-24,-12,0,12,24],[3,3.2,3.4,3.6,3.8])]
    holes += [(x,-7.5,d/2) for x,d in zip([-18,-6,6,18],[6,6.2,6.4,6.6])]
    loops=[outer]+[[(a,b) for a,b,z in ring(x,y,r)] for x,y,r in holes]
    pts=[v for loop in loops for v in loop]+[(x,y) for x,y,r in holes]
    faces=[]
    for indices in Delaunay(np.array(pts)).simplices:
        tri=[pts[int(i)] for i in indices]
        x,y=np.mean(tri,axis=0)
        if any((x-cx)**2+(y-cy)**2<r*r-1e-9 for cx,cy,r in holes):continue
        if area(tri)<0:tri.reverse()
        faces.append(tri)
    # Delaunay is unconstrained: explicitly require every desired boundary edge.
    boundary=Counter(tuple(sorted((tri[i],tri[(i+1)%3]))) for tri in faces for i in range(3))
    exposed={e for e,n in boundary.items() if n==1}
    required={tuple(sorted((loop[i],loop[(i+1)%len(loop)]))) for loop in loops for i in range(len(loop))}
    assert exposed==required,'Triangulation did not preserve polygon boundaries'
    tris=[]
    for tri in faces:
        tris.append(tuple((x,y,4.0) for x,y in tri))
        tris.append(tuple((x,y,0.0) for x,y in reversed(tri)))
    for k,loop in enumerate(loops):
        loop=loop if k==0 else list(reversed(loop))
        for i,(x,y) in enumerate(loop):
            X,Y=loop[(i+1)%len(loop)]
            a,b,c,d=(x,y,0.0),(X,Y,0.0),(X,Y,4.0),(x,y,4.0)
            tris.extend([(a,b,c),(a,c,d)])
    expected=4*(area(outer)-sum(area(loop) for loop in loops[1:]))
    save('round-fit-coupon.stl',tris,expected)

def pin():
    bottom=ring(0,0,6,0);shoulder=ring(0,0,6,2);shaft=ring(0,0,3,2);top=ring(0,0,3,12)
    tris=[]
    for i in range(N):
        j=(i+1)%N
        tris.append(((0.,0.,0.),bottom[j],bottom[i]))
        tris.extend([(bottom[i],bottom[j],shoulder[j]),(bottom[i],shoulder[j],shoulder[i])])
        tris.extend([(shoulder[i],shoulder[j],shaft[j]),(shoulder[i],shaft[j],shaft[i])])
        tris.extend([(shaft[i],shaft[j],top[j]),(shaft[i],top[j],top[i])])
        tris.append(((0.,0.,12.),top[i],top[j]))
    expected=N/2*math.sin(2*math.pi/N)*(6*6*2+3*3*10)
    save('fit-pin-6mm.stl',tris,expected)

if __name__=='__main__':coupon();pin()

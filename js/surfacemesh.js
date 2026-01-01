/**
 * Modified traditional HalfEdge to see if bisectors and the concurrent binary trees is possible..
 * good cache coherence becuase we draw the WholeEdge as quad, and draw the wholeEdge directly.
 * 
 * quad ratio vertex(4):edge(4):quad(2)
 * 
 * Provided 5 classes.
 * HalfEdgeArray
 * FaceArray
 * HoleArray
 * SurfaceMesh
 */

import {Int32PixelArray, Uint32PixelArray, Float32PixelArray, Uint8PixelArray, Float16PixelArray, rehydrateBuffer, allocBuffer, freeBuffer, ExtensiblePixelArrayGroup, PixelArrayGroup} from './pixelarray.js';
import {VertexArray} from './vertex.js';
import {vec3a, vec3} from "./vec3.js";



const HalfEdgeK = {                 // handle location
   vertex: 0,
   face: 1,                         // packed index into face index.
   sizeOf: 2,                       // 2 int32
   end: 0xffffffff,                 // uint max=4,294,967,295
   wholeEdge: (hfEdge)=>{return hfEdge >> 1;},
   isRight: (hfEdge)=>{return hEdge & 1;},   // is right halfEdge,
   pair: (hfEdge)=>{return hfEdge ^ 1;},
};
Object.freeze(HalfEdgeK);



class HalfEdgeArray extends ExtensiblePixelArrayGroup {
   constructor(half, fmm) {
      super(fmm);
      this._edge = half?.edge;
      this._next = half?.next;
      this._prev = half?.prev;
   }
   
   get _freeSlot() {	// no needs, except for length
      return this._next;
   }
   
   * _baseEntries() {
      yield ["_edge", this._edge];
      yield ["_next", this._next];
      yield ["_prev", this._prev];
   }

   static create(size) {
      // HalfEdge must allocated in pair
      const half = {
         edge: Uint32PixelArray.create(HalfEdgeK.sizeOf, 1, size),   // (vertex, face), should we separate (vertex,face)?
         next: Uint32PixelArray.create(1, 1, size),
         prev: Uint32PixelArray.create(1, 1, size),                   // NOTE: prev optional?
      };
      
      return new HalfEdgeArray(half, {});
   }
    
   static rehydrate(self) {
      const ret = new HalfEdgeArray({}, {});
      ret._rehydrate(self);
      
      return ret;
   }
   
   createQuadTexture(gl) {
       return this._edge.createDataTexture(gl);
   }
   
   // iterator
   
   *[Symbol.iterator] () {
      yield* this.rangeIter(0, this.length());
   }
   
   /**
    * walk over given range
    */
   * rangeIter(start, stop) {
      for (let i = start; i < stop; i++) {
         if (!this.isFree(i)) {
            yield i;
         }
      }
   }
   
   * halfEdgeAroundFace(start) {
      //if (start !== HalfEdgeK.end) {
         let current = start;
         do {
            yield current;
            current = this.next(current);
         } while (current !== start);
      //}
   }
   
   * outHalfEdgeAroundVertex(currentOut, end) {
      //if (currentOut !== HalfEdgeK.end) {
         do {
            yield currentOut;
            currentOut = this.next( HalfEdgeK.pair(currentOut) );         
         } while (currentOut !== end);
      //}
   }
      
   * inHalfEdgeAroundVertex(currentIn, end) {
      //if (currentIn !== HalfEdgeK.end) {
         do {
            yield currentIn;
            currentIn = HalfEdgeK.pair( this.next( currentIn ) );
         } while (currentIn !== end);
      //}
   }
   
   /**
    * search for free InEdge gap, after Start, before End.
    * @see {@link http://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm}
    * @param {integer} inStart 
    * @param {integer} inBefore 
    * @returns {integer} - the gap index, or HalfEdgeK.end if not founded.
    */
   findFreeInEdge(start, end) {
      for (let inHalf of this.inHalfEdgeAroundVertex(start, end)) {
         if (this.isBoundary(inHalf)) {
            return inHalf;
         }
      }
      return HalfEdgeK.end;
   }
   
   // api
   
   /**
    * if both side of face are the same, the wEdge is not in use.
    */
   isFree(hEdge) {
      // check if both side of hEdge is the same
      const pair = hEdge ^ 1;
      return (this._edge.get(hEdge, HalfEdgeK.face) ===
               this._edge.get(pair, HalfEdgeK.face) );
   };
   
   isBoundary(hEdge) {
      return this._edge.get(hEdge, HalfEdgeK.face) >= HoleK.start;
   }
   
   isValid(hfEdge) { // check against length?
      return hfEdge !== HalfEdgeK.end;
   }

   prev(hEdge) {
      return this._prev.get(hEdge, 0);
   }

   next(hEdge) {
      return this._next.get(hEdge, 0);
   }

   pair(hfEdge) {
      return hfEdge ^ 1;
   }
   
   linkNext(hEdge, next) {
      this._next.set(hEdge, 0, next);
      this._prev.set(next, 0, hEdge);
   }
   
   face(hEdge) {
      return this._edge.get(hEdge, HalfEdgeK.face);// >> 8;
   }
   
   setFace(hEdge, face) {//, index) {
      //face = (face << 8) + index;
      this._edge.set(hEdge, HalfEdgeK.face, face);
   }
      
   destination(hEdge) {
      const pair = hEdge ^ 1;
      return this.origin(pair);
   }
   
   origin(hEdge) {
      return this._edge.get(hEdge, HalfEdgeK.vertex);
   }
   
   setOrigin(hEdge, vertex) {
      this._edge.set(hEdge, HalfEdgeK.vertex, vertex);
   }

   stat() {
      return "HalfEdge Length: " + this.length() + "; Free HalfEdge Size: " + this._freeMM.size + ";\n";
   }

   sanityCheck() {
      let length = this.length();
      for (let i = 0; i < length; ++i) {

      }
      return true;
   }
   
   //
   // convenient utility functions for adding dynamic uv(index).
   //
   static addUV(halfEdgeArray, index=0) {
      const type = {
         className: 'Float16PixelArray',
         sizeOf: 2,
         numberOfChannel: 2,
         initialSize: halfEdgeArray.length(),
         fields: {
            U: [0, 1],                    // [position, size]
            V: [1, 1],
            UV: [0, 2],
         }
      }
      return halfEdgeArray.addProperty(`uv${index}`, type);
   }
}


class WholeEdgeArray extends ExtensiblePixelArrayGroup {
   constructor(whole, half, fmm) {
      super(fmm);
      this._sharpness = whole?.sharpness;
      this._baseColor = whole?.baseColor;
      this.half = half;
   }
   
   get _freeSlot() {
      return this._baseColor;
   }
   
   * _baseEntries() {
      yield ["_sharpness", this._sharpness];
      yield ["_baseColor", this._baseColor];                       // baseColor texture
   }
   
   static create(size) {
      const whole = {
         sharpness: Float32PixelArray.create(1, 1, size),          // f8 is enough.
         baseColor: Int32PixelArray.create(1, 1, size)             // texture id, 16bit enough?
         // roughness: , metallic:, emission:, opacity:, 
      };
      
      // HalfEdge must allocated in pair
      const half = HalfEdgeArray.create(size*2);

      return new WholeEdgeArray(whole, half, {});
   }
   
   _rehydrate(self) {
      super._rehydrate(self);
      
      this.half = HalfEdgeArray.rehydrate(self.half);
   }
   
   static rehydrate(self) {
      const ret = new WholeEdgeArray({}, {}, {});
      ret._rehydrate(self);
      return ret;
   }
   
   getDehydrate(obj) {
      super.getDehydrate(obj);

      obj.half = this.half.getDehydrate({});

      return obj;
   }  
   
   // memory routines
   computeBufferSize(length) {
      return super.computeBufferSize(length) +
              this.half.computeBufferSize(length*2);
   }
   
   setBuffer(bufferInfo, byteOffset, length) {
      byteOffset = super.setBuffer(bufferInfo, byteOffset, length);
      if (!bufferInfo) {   // get the newly located one.
         bufferInfo = this._sharpness._blob.bufferInfo;
      }

      return this.half.setBuffer(bufferInfo, byteOffset, length*2);
   }
   
   _allocArray(count) {
      this.half._allocArray(count*2);
      return super._allocArray(count);
   }
   
   free(whEdge) {
      super.free(whEdge);
      const left = whEdge*2;
      this.half.setFace(left, HoleK.end);
      this.half.setFace(left+1, HoleK.end);
   }
   
   isFree(whEdge) {
      const left = whEdge*2;
      return this.half.face(left) === this.half.face(left+1);
   }
   
   // iterator
   *[Symbol.iterator]() {
      yield* rangeIter(0, this.length());
   }
   
   * rangeIter(start, stop) {
      for (let i = start; i < stop; ++i) {
         if (!this.isFree(i)) {
            yield i;
         }
      }
   }
   
   // api
   createEdge(begVert, endVert) {
      const left = this.alloc() * 2;
      const right = left + 1;
      
      this.half.setOrigin(left, begVert);
      this.half.setOrigin(right, endVert);
      this.half.setFace(left, HoleK.end);
      this.half.setFace(right, HoleK.end);
      this.half.linkNext(left, right);
      this.half.linkNext(right, left);

      // orient vertex.outEdge to the smalles id
      //this.addAffectedVertex(begVert).addAffectedVertex(endVert);
      //begVert.orient(outEdge);
      //endVert.orient(outEdge.pair);
      return [left, right];
   }

   sharpness(whEdge) {
      return this._sharpness.get(whEdge, 0);
   }
   
   setSharpness(whEdge, value) {
      this._sharpness.set(whEdge, 0, value);
   }
   
   stat() {
      return "to be implemented ";
   }
}

class FaceArray extends PixelArrayGroup {
   constructor(array, fmm) {
      super(fmm);
      this._hfEdge = array?.hfEdge;
      this._numberOfSide = array?.numberOfSide;
      this._material = array?.material;
      this._center = array?.center;
   }
   
   get _freeSlot() {
      return this._hfEdge;
   }
   
   * _baseEntries() {
      yield ["_hfEdge", this._hfEdge];
      yield ["_numberOfSide", this._numberOfSide];
      yield ["_material", this._material];
      yield ["_center", this._center];
   }
   
   static create(size) {
      const array = {
         hfEdge: Int32PixelArray.create(1, 1, size),
         numberOfSide: Int32PixelArray.create(1, 1, size),
         center: Float32PixelArray.create(4, 4, size),      // align with vertex's position.
      };
      //if (hasMaterial) {
         array.material = Int32PixelArray.create(1, 1, size);
      //}

      return new FaceArray(array, {});
   }

   static rehydrate(self) {
      const ret = new FaceArray({}, {});
      ret._rehydrate(self);
      return ret;
   }
   
   computeCenter(hContainer, vContainer) {
      const cBuffer = this._center.getBuffer();
      const vBuffer = vContainer.positionBuffer();
      const center = [0, 0, 0];
      for (let i of this) {
         center[0] = center[1] = center[2] = 0.0;
         for (let v of this.vertexAround(hContainer, i)) {
            // accumulate center
            vec3a.add(center, 0, vBuffer, v*4);
         }
         // now average and store
         const scale = 1 / this._numberOfSide.get(i, 0);
         vec3.scale(cBuffer, i*4, center, 0, scale);
      }
   }
   
   getCenter() {
      return this._center.getBuffer();
   }

   createMaterialTexture(gl) {
      return this._material.createDataTexture(gl);
   }
   
   _free(handle) {
      this._numberOfSide.set(handle, 0, 0);        // reset to 0
   }
   
   isFree(handle) {
      return (this._numberOfSide.get(handle, 0) < 3);
   }
   
   *[Symbol.iterator] () {
      yield* this.rangeIter(0, this.length());
   }

   * rangeIter(start, stop) {
      //stop = Math.min(this.length(), stop);
      for (let i = start; i < stop; i++) {
         if (!this.isFree(i)) {
            yield i;
         }
      }
   }
   
   * vertexAround(hfEdgeContainer, face) {
      const start = this.halfEdge(face);
      for (const hEdge of hfEdgeContainer.halfEdgeAroundFace(start)) {
         yield hfEdgeContainer.origin(hEdge);
      }
   }
   
   /**
    * ==halfLoop
    */
   * halfEdgeAround(hfEdgeContainer, face) {
      const start = this.halfEdge(face);
      yield* hfEdgeContainer.halfEdgeAroundFace(start);  
   }
   
   * faceAround(hfEdgeContainer, face) {
      const start = this.halfEdge(face);
      for (let hfEdge of hfEdgeContainer.halfEdgeAroundFace(start)) {
         const pair = HalfEdgeK.pair(hfEdge);
         yield hfEdgeContainer.face(pair);
      }
   }
   
   halfEdge(handle) {
      return this._hfEdge.get(handle, 0);
   }
   
   material(face) {
      const hfEdge = this.halfEdge(face);
      return hfEdgeContainer.material(hfEdge);
   }
   
   numberOfSide(handle) {
      return this._numberOfSide.get(handle, 0);
   }
   
   setHalfEdge(face, hfEdge) {
      this._hfEdge.set(face, 0, hfEdge);
   }
   
   setMaterial(face, material) {
      this._material.set(face, 0, material);
   }
   
   setNumberOfSide(face, count) {
      this._numberOfSide.set(face, 0, count);
   }

   sanityCheck(hfEdgeContainer, isHole=false) { // check halfEdge, and the faceloop is correct.
      const offset = isHole ? HoleK.start : 0;
      for (let face of this) {
         let numberOfSide = 0;
         for (let hfEdge of this.halfEdgeAround(hfEdgeContainer, face)) {
            const faceCheck = hfEdgeContainer.face(hfEdge);
            if (faceCheck !== (face+offset)) {
               console.log("polygon: " + (face+offset) + " is not consistent with " + " halfEdge: " + hfEdge);
               return false;
            }
            ++numberOfSide;
         }
         if (numberOfSide !== this.numberOfSide(face)) {
            console.log("Polygon: " + (face+offset) + " number of side is not consistent with " + " halfEdge: " + hfEdge);
            return false;
         }
      }
      return true;
   }
   
   stat() {
      return "Polygon Count: " + this.length() + ";\n";
   }
}



const HoleK = {
   end: 0xffffffff,                       // uint max=4,294,967,295
   start: 3.5 * 1024 * 1024 * 1024,       // starting from 3.5GB
   isHole: (handle)=>{ return handle >= HoleK.start; },
}
Object.freeze(HoleK);

/**
 * combine face/hole handling.
 * 
 */
class FaceHoleArray {
   constructor(face, hole) {
      this.f = face;
      this.o = hole;
   }
   
   static create(size) {
      const face = FaceArray.create(size);
	   const hole = FaceArray.create(size);
	   
	   return new FaceHoleArray(face, hole);
   }
   
   length() {
      return this.f.length() + this.o.length();
   }
   
   alloc() {
      return this.f.alloc();
   }
   
   allocFromHole() {
      return this.o.alloc() + HoleK.start;
   }
   
   free(handle) {
      if (handle < HoleK.start) {
         this.f.free(handle);
      } else {
         this.o.free(handle - HoleK.start);
      }
   }
   
   computeCenter(hContainer, vContainer) {
      this.f.computeCenter(hContainer, vContainer);
   }
   
   halfEdge(handle) {
      if (handle < HoleK.start) {
         return this.f.halfEdge(handle);
      } else {
         return this.o.halfEdge(handle - HoleK.start);
      }
   }
   
   material(handle) {
      if (handle < HoleK.start) {
         return this.f.material(handle);
      } else {
         throw("no material for hole");
         return -1;
      }
   }
   
   numberOfSide(handle) {
      if (handle < HoleK.start) {
         return this.f.numberOfSide(handle);
      } else {
         return this.o.numberOfSide(handle - HoleK.start);
      }      
   }
   
   setHalfEdge(handle, hfEdge) {
      if (handle < HoleK.start) {
         this.f.setHalfEdge(handle, hfEdge);
      } else {
         this.o.setHalfEdge(handle, hfEdge - HoleK.start);
      }
   }
   
   setMaterial(handle, material) {
      if (handle < HoleK.start) {
         this.f.setMaterial(handle, material);
      } else {
         throw("no material for hole");
      }
   }
   
   setNumberOfSide(handle, count) {
      if (handle < HoleK.start) {
         this.f.setNumberOfSide(handle, count);
      } else {
         this.o.setNumberOfside(handle - HoleK.start, count);
      }
   }
   
   sanityCheck(hEdgeContainer) {
      const fOk = this.f.sanityCheck(hEdgeContainer, false);
      const oOk = this.o.sanityCheck(hEdgeContainer, true);
      return fOk && oOk;
   }
   
   stat() {
      return this.f.stat() + this.o.stat();
   }
}



/**
 * name group for collection of faces.
 */
class NameGroup {
   constructor(name, start) {
      this._name = name;
      this._faces = {start: start, end: start+1};    // restriction to continus faces, should be an array of faces to be more flexible.
   }

   finalize(end) {
      //this._faces.start = start;
      this._faces.end = end;
   }
}



/** 
 * abstract class representing Mesh. base SurfaceMesh, managing material,
 * vertex, hEdge, face, and boundaryLoop.
 */
class SurfaceMesh {
   constructor(whEdges, vertices, faces, bin) {
      this._bin = bin;
      this.we = whEdges;
      this.v = vertices;
      this.f = faces;
   }
   
   static create(size) {
      const whEdges = WholeEdgeArray.create(size);
      const vertices = VertexArray.create(size);
      const faces = FaceHoleArray.create(size);
      const bin = {nameGroup: []};
      
      return new SurfaceMesh(whEdges, vertices, faces, bin);
   }

/*   static _createInternal(materialDepot) {
      const bin = {nameGroup:[], };

      const material = {depot: materialDepot};
      const warehouse = new Map
      material.used = warehouse;
      material.proxy = {                    // TODO: use real proxy?
         *[Symbol.iterator] () {
            yield* warehouse;
         },

         addRef: (material, count)=> {
            materialDepot.addRef(material, count);
            let oldCount = warehouse.get(material);
            if (oldCount === undefined) {
               oldCount = 0;
            }
            warehouse.set(material, oldCount + count);
         },

         releaseRef: (material, count)=> {
            materialDepot.releaseRef(material, count);
            let oldCount = warehouse.get(material);
            count = oldCount - count;
            if (count) {
               warehouse.set(material, count);
            } else {
               warehouse.delete(material);
            }
         },

         getDefault: ()=> {
            return materialDepot.getDefault();
         },
      };

      return [bin, material];
   }*/
   
   static _rehydrateInternal(self) {
      // nothing, we are only interested in geometry data.
      return [null, null];
   }

   getDehydrate(obj) {
      // get nothing because subdivide don't use it? material?
      return obj;
   }
   
   /**
    *  reserve pixel array capacity for static mesh. for dynamic reserve individually.
    * @param {int} nVertices - number of vertices
    * @param {int} nWEdges = number of WhlEdges
    */
   reserve(nVertices, nWEdges, nFaces, nHoles, isStatic=true) {
      // padded to rectData dimension.
      nVertices = computeDataTextureLen(nVertices);
      nWhEdges = computeDataTextureLen(nWhEdges);
      nFaces = computeDataTextureLen(nFaces);
      nHoles = computeDataTextureLen(nHoles);
      
      if (isStatic) {
         const totalBytes = this.v.computeBufferSize(nVertices)
                          + this.we.computeBufferSize(nWEdges)
                          + this.f.f.computeBufferSize(nFaces)
                          + this.f.o.computeBufferSize(nHoles);
      
         // reserve total linear memory
         const newBuffer = allocBuffer(totalBytes);
         // set new buffer and copy over if necesary.
         let byteOffset = this.v.setBuffer(newBuffer, 0, nVertices);
         //console.log("offset: " + byteOffset);
         byteOffset = this.we.setBuffer(newBuffer, byteOffset, nWEdges);
         //console.log("offet: " + byteOffset);
         byteOffset = this.f.f.setBuffer(newBuffer, byteOffset, nFaces);
         //console.log("offset: " + byteOffset);
                      this.f.o.setBuffer(newBuffer, byteOffset, nHoles);
      } else { // reserve linear memory separately for dynamic resizing
         this.v.setBuffer(null, 0, nVertices);
         this.we.setBuffer(null, 0, nWEdges);
         this.f.f.setBuffer(null, 0, nFaces);
         this.f.o.setBuffer(null, 0, nHoles);
      }
   }
   
   makePullBuffer(gl) {
      //this.v.computeNormal(this.h);
   
      const vertexTexture = this.we.half.createQuadTexture(gl);
      const positionTexture = this.v.createPositionTexture(gl, this.f.f._center);
      const normalTexture = this.v.createNormalTexture(gl);
      const uvsTexture = this.we.half.createPropertyTexture('uv0', gl);
      
      //const pbrTexture = this._material.depot.createTexture(gl);
      const materialTexture = this.f.f.createMaterialTexture(gl);
      
/*      const materials = [];
      for (let [handle, count] of this._material.used) {
         materials.push( this._material.depot.getUniforms(handle) );
      }*/
      
      return {pullLength: this.we.length(),
              faceStart: {type: "ui", value: positionTexture[1]},
              holeStart: {type: "ui", value: HoleK.start},
              vertex: {type:"usampler2D", value: vertexTexture},
              position: {type:"sampler2D", value: positionTexture[0]}, 
              normal: {type:"sampler2D", value: normalTexture},
              uvs: {type: "sampler2DArray", value: uvsTexture},
              //pbr: {type: "sampler2D", value: pbrTexture},
              material: {type: "sampler2D", value: materialTexture},
             };
   }
   
   /**
    * shrink, post process,
    * compacting internal array, no freed slots in array.
    * required for subdivision.
    * returned changed position.
    */
   compactBuffer() {
      const changed = {};
      //changed.v = this.v.compactBuffer();
      //changed.f = this.f.compactBuffer();
      changed.h = this.h.compactBuffer();
      
      return changed;
   }

   // post process
   // fill boundaryLoop with holes.
   fillBoundary() {
      // walk through all halfEdges, assign hole to each hEdge group. 
      const hfEdges = this.we.half;
      for (let hfEdge of hfEdges) {
         let face = hfEdges.face(hfEdge);
         if (face === HoleK.end) {   // unassigned hEdge, get a new Hole and start assigning the whole group.
            const hole = this.f.allocFromHole();
            this.f.setHalfEdge(hole, hfEdge);
            // assigned holeFace to whole group
            for (let current of this.we.half.halfEdgeAroundFace(hfEdge)) {
               this.we.setSharpness(hfEdge >> 1);
               hfEdges.setFace(current, hole);
            }
         }
      }
   }
   
   /**
    * finalized meshes, filled holes, compute crease, valence
    * editDone() - post process
    */
   finalizeEdit() {
      this.fillBoundary();
      // now compute valence, crease 
      this.v.computeValence(this.we);
      this.v.computeLoopNormal(this.we.half);   // NOTE: do we needs normal?
      // shrink, compaction
      //this.compactBuffer();
      // compute face center
      this.f.computeCenter(this.we.half, this.v);
   }
      
   addNameGroup(name, start) {
      let ret = new NameGroup(name, start);
      this._bin.nameGroup.push( ret );
      return ret;
   }
      
   addVertex(inPt, inOffset=0) {
      // allocated from both pt and vertex
      const vertex = this.v.alloc();
      this.v.setHalfEdge(vertex, HalfEdgeK.end);   // no halfEdge set yet.
      this.v.setValence(vertex, 0);                // valence(-1) for unitialized yet not free?
      this.v.copyPt(vertex, inPt, inOffset);
      return vertex;
   }
    
   sanityCheck() { 
      const hOk = this.we.sanityCheck();
      const vOk = this.v.sanityCheck(this.we.half);
      const fOk = this.f.sanityCheck(this.we.half);
      return (vOk && hOk && fOk);
   }
   
   stat() {
      let status = this.v.stat();
      status += this.we.stat();
      status += this.f.stat();
      return status;
   }  
      
   isEmpty() {
      return (this.v.length() === 0) && (this.f.length() === 0);
   }
   
   addFace(pts, material) {
      return this.addFaceEx(0, pts.length, pts, material);
   }
   
   addFaceEx(start, end, pts, material) {
      const length = end - start;
      const result =  {face: HoleK.end, halfLoop: []}; // init to failure 
      if (length < 3) { // at least a triangle
         console.log("Bad polygon: less than 3 edges");
         return result;
      } else if (length >= 256) {
         console.log("Bad polygon: more than 255 edges");
         return result;
      }

      const newPolygon = this.f.alloc();

      const hfEdges = this.we.half;
      let prevHalf = HalfEdgeK.end;
      let nextHalf = HalfEdgeK.end;
      let nextIndex = start;
      // builds WingEdge if not exist
      const halfLoop = [];
      const newEdges = [];
      for (let i = start; i < end; ++i) {
         nextIndex = i + 1;
         if (nextIndex === end) {
            nextIndex = start;
            nextHalf = halfLoop[0];
         }

         let v0 = pts[i];
         let v1 = pts[nextIndex];
         let hfEdge = this.findHalfEdge(v0, v1);
         if (hfEdge === HalfEdgeK.end) { // not found, create one
            hfEdge = this._addEdgeEx(v0, v1, prevHalf, nextHalf);
            if (hfEdge === HalfEdgeK.end) {
               this._unwindNewEdges(newPolygon, newEdges, halfLoop);
               return result;
            }
            newEdges.push(hfEdge);
         } else if (!hfEdges.isBoundary(hfEdge)) { // only free can form a chain.
            this._unwindNewEdges(newPolygon, newEdges, halfLoop);
            // This half-edge would introduce a non-manifold condition.
            console.log("non-manifold condition, no boundary");
            return result;
         }
         prevHalf = hfEdge;
         halfLoop.push( hfEdge );
         hfEdges.setFace(hfEdge, newPolygon, i-start);      // mark as used to prevent complex polygon,
      }

      // Try to reorder the links to get correct halfLoop.
      for (let i = 0; i < length; ++i) {
         nextIndex = (i + 1) % length;    // wrap to zero

         if (!this.makeAdjacent(halfLoop[i], halfLoop[nextIndex])) {
            this._unwindNewEdges(newPolygon, newEdges, halfLoop);
            // The polygon would introduce a non-manifold condition.
            console.log("non-manifold condition, cannot splice");
            return result;
         }
      }

      //// Link half-edges to the polygon.
      this.f.setHalfEdge(newPolygon, halfLoop[0]);
      // set material and number of side
      this.f.setMaterial(newPolygon, material);
      this.f.setNumberOfSide(newPolygon, length);
      
      // success.
      result.face = newPolygon;
      result.halfLoop = halfLoop;
      return result;
   }
   
   /**
    * find the halfEdge that connect between (v0, v1) if any.
    */
   findHalfEdge(v0, v1) {
      const hfEdges = this.we.half;
      for (let outEdge of this.v.outHalfEdgeAround(hfEdges, v0)) {
         const vTest = hfEdges.destination(outEdge);
         if (vTest === v1) {
            return outEdge;
         }
      }
      return HalfEdgeK.end;
   }
   
   /**
    * return HalfEdge ptr.
    */
   _addEdgeEx(begVert, endVert, prevHalf, nextHalf) {
      // initialized data.
      const [left, right] = this.we.createEdge(begVert, endVert);

      // link outedge, splice if needed
      const hEdges = this.we.half;
      const vertices = this.v;
      if (prevHalf !== HalfEdgeK.end) {    // splice directly to prevHalf
         hEdges.linkNext( right, hEdges.next(prevHalf) );  //edge.right.next = prevHalf.next;
         hEdges.linkNext( prevHalf, left );                //prevHalf.next = edge.left;
      } else if (!this.linkEdge(begVert, left, right)) {
         // release the edge
         this.we.free(HalfEdgeK.wholeEdge(left));
         return HalfEdgeK.end;
      }
      
      if (nextHalf !== HalfEdgeK.end) {    // Link inedge, splice
         hEdges.linkNext( hEdges.prev(nextHalf), right );  // prev.next = edge.right;
         hEdges.linkNext( left, nextHalf );                // edge.left.next = nextHalf
      } else if (!this.linkEdge(endVert, right, left)) {
         vertices.unlinkEdge(begVert, left, right);
         // release the edge
         this.we.free( HalfEdgeK.wholeEdge(right) );
         return HalfEdgeK.end;
      }

      // return outEdge.
      return left;
   };

   /**
    * @see {@link http://kaba.hilvi.org/homepage/blog/halfedge/halfedge.htm}
    */
   makeAdjacent(inEdge, outEdge) {
      const hEdges = this.we.half;
      const b = hEdges.next(inEdge);
      if (b === outEdge) {             // adjacency is already correct.
         return true;
      }

      //const b = hEdges.next(inEdge);
      const d = hEdges.prev(outEdge);

      // Find a free incident half edge
      // after 'out' and before 'in'.
      const g = hEdges.findFreeInEdge(HalfEdgeK.pair(outEdge), inEdge);

      if (g === HalfEdgeK.end) {
         console.log("Mesh.addFace.findFreeInEdge: patch re-linking failed");
         console.log("Mesh.makeAjacent: no free inEdge, bad adjacency");
         return false;
      } else if (g === d) {
         hEdges.linkNext(inEdge, outEdge);
         hEdges.linkNext(d, b);
      } else {
         const h = hEdges.next(g);

         hEdges.linkNext(inEdge, outEdge);

         hEdges.linkNext(g, b);

         hEdges.linkNext(d, h);
      }
      return true;
   }  
   
   /**
    * link (out, in) to vertex's outEdge if any. 
    */
   linkEdge(vert, outHalf, inHalf) {  // outHalf,inHalf(left,right) of whEdge
      const outEdge = this.v.halfEdge(vert);
      if (outEdge === HalfEdgeK.end) { // isolated vertex.
         this.v.setHalfEdge(vert, outHalf);
      } else {
         const hfEdges = this.we.half; 
         
         let inEdge = HalfEdgeK.pair(outEdge);
         inEdge = hfEdges.findFreeInEdge(inEdge, inEdge);
         if (inEdge === HalfEdgeK.end) {
            console.log("Error: Mesh.linkEdge: complex vertex " + vert);
            return false;
         }

         // else insert into circular list.
         const nextHf = hfEdges.next(inEdge);
         hfEdges.linkNext( inEdge, outHalf);
         hfEdges.linkNext( inHalf, nextHf);
         if (outHalf < outEdge) {   // smallest handle should be the default
            this.v.setHalfEdge(outHalf);
         }
      }
      // link edge successful
      return true;
   }
   
   _unlinkEdge(vert, outHalf, inHalf) {  // outHalf/inHalf of wEdge.
      const hfEdges = this.we.half;
      const prev = hfEdges.prev(outHalf);
      if (prev === HalfEdgeK.end) {
         throw("Error: no Prev hEdge");
      }
      if (this.v.halfEdge(vert) === outHalf) {
         if (prev === inHalf) {
            this.v.setHalfEdge(vert, -1);
            return;
         }
         
         // reorient 
         this.v.setHalfEdge(vert, HalfEdgeK.pair(prev));
         //this.reorient(vert);
      }
      // remove from circular list.
      hEdges.linkNext( prev, hEdges.next(inHalf) );
   }
   
   /**
    * failed addPolygon. free and unlink edges, and unset face
    * @param {uint} polygon - handle
    * @param {array} halfEdges - array of newly created halfEdge
    * @param {array} halfLoop - array of all halfEdge, new or old. processed at this point.
    */
   _unwindNewEdges(polygon, halfEdges, halfLoop) {      
      //this._faces.setHalfEdge(polygonId, -1);
      this.f.free(polygon);

      const hfEdges = this.we.half;
      // unset face, back to boundary halfEdge.
      for (let hfEdge of halfLoop) {
         hfEdges.setFace(hfEdge, HoleK.end);
      }

      const vertices = this.v;
      const whEdges = this.we;
      // free the newly created edges
      for (let halfEdge of halfEdges) {
         let pair = HalfEdgeK.pair(halfEdge);
         vertices._unlinkEdge( hfEdges.origin(halfEdge), pair);
         vertices._unlinkedge( hfEdges.origin(pair), halfEdge);
         whEdges.free( HalfEdgeK.wholeEdge(halfEdge) );
      }
   }
   
}

export {
   HalfEdgeArray,
   FaceHoleArray,
   SurfaceMesh,
}

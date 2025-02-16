/**
 glUtil

*/

function setUniform(gl, setter, uniformInfo) {
   switch (uniformInfo.type) {
      case "i":
         gl.uniform1i(setter.loc, uniformInfo.value);
         break;
      case "ui":
         gl.uniform1ui(setter.loc, uniformInfo.value);
         break;
      case "ivec3":
         gl.uniform3iv(setter.loc, uniformInfo.value);
      break;
      case "vec3":
         gl.uniform3fv(setter.loc, uniformInfo.value);
      break;
      case "ivec4":
         gl.uniform4iv(setter.loc, uniformInfo.value);
      break;
      case "vec4":
         gl.uniform4fv(setter.loc, uniformInfo.value);
      break;
      case "mat4":
         gl.uniformMatrix4fv(setter.loc, false, uniformInfo.value);
      break;
      case "sampler2D":
      case "usampler2D":
      case "isampler2D":
         gl.activeTexture(gl.TEXTURE0 + setter.unit);
         gl.bindTexture(gl.TEXTURE_2D, uniformInfo.value);
         gl.uniform1i(setter.loc, setter.unit);
      break;
      case "sampler2DArray":
         gl.activeTexture(gl.TEXTURE0 + setter.unit);
         gl.bindTexture(gl.TEXTURE_2D_ARRAY, uniformInfo.value);
         gl.uniform1i(setter.loc, setter.unit);
      break;
      default:
         console.log("not supported type: " + uniformInfo.type);
   }
}

function setUniforms(gl, programInfo, uniformInfos) {
   let locations = programInfo.uniforms;
   for (let [key, info] of Object.entries(uniformInfos)) {
      if (!locations[key]) {  // initialized if not already
         const loc = gl.getUniformLocation(programInfo.program, key);
         if (loc !== null) {
            locations[key] = {loc};
            if ((info.type === "sampler2D") || 
                (info.type === "isampler2D") || 
                (info.type === "usampler2D") ||
                (info.type === "sampler2DArray")) {
               locations[key].unit = programInfo.textureUnit++;
            }
         }
      }
      // initialized
      if (locations[key]) {
         setUniform(gl, locations[key], info);
      } else {
         console.log("no uniform: " + key + " used in this shader");
      }
   }
}

function createProgram(gl, vs, fs) {
   const vShader = gl.createShader(gl.VERTEX_SHADER);
   gl.shaderSource(vShader, vs);
   gl.compileShader(vShader);

   let message = gl.getShaderInfoLog(vShader);

   if (message.length > 0) {
      // message may be an error or a warning 
      throw message;
   }

   const fShader = gl.createShader(gl.FRAGMENT_SHADER);
   gl.shaderSource(fShader, fs);
   gl.compileShader(fShader);
   
   message = gl.getShaderInfoLog(fShader);

   if (message.length > 0) {
      // message may be an error or a warning 
      throw message;
   }

   
   const program = gl.createProgram();
   
   gl.attachShader(program, vShader);
   gl.attachShader(program, fShader);

   gl.linkProgram(program);

   if ( !gl.getProgramParameter(program, gl.LINK_STATUS) ) {
      const info = gl.getProgramInfoLog(program);
      throw 'Could not compile WebGL program. \n\n' + info;
   }

   return {program, uniforms: {}, textureUnit: 0};
}

/**
 * draw fullEdge as one quad. the 2 triangles share the same material
 * for texture only material.
 */
let quadIndex;
function drawQuad(gl, length) {
   if (!quadIndex) {
      quadIndex = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
      const indices = [0, 3, 2,     // first triangle
                       0, 2, 1,];   // second triangle
   
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
                     new Uint8Array(indices), 
                     gl.STATIC_DRAW);
   } else {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndex);
   }
   gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, length);
};

/**
 * draw fullEdge as 2 separate triangle, each triangle can have it own material.
 * for drawing app before baking the material to texture.
 */
function drawTwoTri(gl, programInfo, count) {
   if (!programInfo.twoTriArray) {
      programInfo.vertexAttributeLocation = gl.getAttribLocation(programInfo.program, 'a_vertexID');
      
      programInfo.twoTriArray = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, programInfo.twoTriArray);
      const array = [0, 3, 2,       // first triangle
                     0, 2, 1,];     // second triangle
      gl.bufferData(gl.ARRAY_BUFFER,
                    new Int8Array(array),
                    gl.STATIC_DRAW);
   } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, programInfo.twoTriArray);
   }
   
   // Tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER), do we needs to rebind everytime? since it always the same.
   gl.vertexAttribIPointer(programInfo.vertexAttributeLocation, 
                           1,                         // 1 component
                           gl.BYTE,                   // 8bit int
                           false, 0, 0);              // normalize=false, stride=0, offset=0
   gl.enableVertexAttribArray(programInfo.vertexAttributeLocation);
   
   gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
};


const kTEXTURE = {
   maxSize: 0,
   minLength: 1,
};
function setConstant(gl) {
   kTEXTURE.maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
   kTEXTURE.minLength = kTEXTURE.maxSize;
   Object.freeze(kTEXTURE);
   gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
};




function _dontFilter2D(gl) {
   // don't do filtering
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);      
}

function makeDataTexture(gl, internalFormat, format, type, pixelStride, data, length) {
   let [width, height] = computeDataTextureDim(length, pixelStride);

   const tex = gl.createTexture();
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D, tex);
   
   
   _dontFilter2D(gl);
   // allocate image
   gl.texStorage2D(gl.TEXTURE_2D,
     1,                    // 1 level only
     internalFormat,
     width, height);
   
   // copy texture
   gl.texSubImage2D(gl.TEXTURE_2D,
     0,                    // base image
     0, 0, width, height,  // x, y, width, height,
     format, type,
     data
   );
   
   return tex;
};

function makeDataTextureConcat(gl, internalFormat, format, type, pixelStride, dataA, lengthA, dataB, lengthB) {
   let [width, heightA, heightB] = computeDataTextureConcatDim(lengthA, lengthB, pixelStride);
   
   const tex = gl.createTexture();
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D, tex);
   
   
   _dontFilter2D(gl);
   // allocate image
   gl.texStorage2D(gl.TEXTURE_2D,
     1,                    // 1 level only
     internalFormat,
     width, heightA+heightB);
   
   // copy texture A
   gl.texSubImage2D(gl.TEXTURE_2D,
     0,                       // base image
     0, 0, width, heightA,   // x, y, width, height,
     format, type,
     dataA
   );
   // copy texture B, we really want contigous array, but it much more hassle.
   gl.texSubImage2D(gl.TEXTURE_2D,
     0,                       // base image
     0, heightA, width, heightB,   // x, y, width, height,
     format, type,
     dataB
   );
   
   // return [texHandle, dataB start position]
   return [tex, width*heightA];
}


/**
 * update gpu data texture, reflect the change in cpu's data 
 * 
 */
function updateDataTexture(gl, texID, data, internalFormat, format, type, pixelType, start, end) {
   // select texture
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D, texID);
   
   //_dontFilter2D(gl);
   
   // TODO: copied the change data.
   
   
}


function makeDataTexture3D(gl, internalFormat, format, type, pixelStride, data, length) {   
   const numImages = data.length;   // slices
   const [width, height] = computeDataTextureDim(length, pixelStride);
    
   const texture = gl.createTexture();
   // -- Init Texture
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
   // we don't need any filtering
   gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
   gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

   gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
   
   // allocated image
   gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 
      1,                            // 1 image, no mipmap
      internalFormat,
      width, height, numImages,
   );
   // now copy over to gpu
   for (let i = 0; i < numImages; ++i) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY,
         0,                            // base image
         0, 0, i, width, height, 1,    // xoffset, yoffset, zoffset, width, height, depth,
         format, type,
         data[i]      
      );
   }
   
   return texture;
};


function defaultSampler(gl) {
      const options = {
         format: gl.RGBA,
         type: gl.UNSIGNED_BYTE,
         magFilter: gl.LINEAR,
         minFilter: gl.LINEAR,
         wrapS: gl.REPEAT,//gl.CLAMP_TO_EDGE;
         wrapT: gl.REPEAT,//gl.CLAMP_TO_EDGE;
         flipY: false,
         unit: 0,
         // channel: -1,
      };
      return options;
}


function setImage(gl, handle, image, sampler) {
      //image = gl.resizeImage(image);

      gl.activeTexture(gl.TEXTURE0+7);                // use baseColorTexture position to update.
      gl.bindTexture(gl.TEXTURE_2D, handle);
      if (sampler.flipY) {
         gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, sampler.magFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, sampler.minFilter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, sampler.wrapS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, sampler.wrapT);      
      gl.texImage2D(gl.TEXTURE_2D, 0, sampler.format, sampler.format, sampler.type, image);
      
      if ((sampler.minFilter != gl.NEAREST) && (sampler.minFilter != gl.LINEAR)) {
        gl.generateMipmap(gl.TEXTURE_2D);
      }
      if (sampler.flipY) { // restore to default setting
         gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
      }
}


function setWHITE(gl, whiteHandle) {
   gl.activeTexture(gl.TEXTURE0+7);                // use baseColorTexture position to update.
   gl.bindTexture(gl.TEXTURE_2D, whiteHandle);
   // Fill the texture with a 1x1 white pixel.
   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
}


let CHECKERBOARD;
function getCHECKERBOARD() {
   if (!CHECKERBOARD) {
      const c = document.createElement('canvas').getContext('2d');
      c.canvas.width = c.canvas.height = 128;
      for (var y = 0; y < c.canvas.height; y += 16) {
         for (var x = 0; x < c.canvas.width; x += 16) {
            c.fillStyle = (x ^ y) & 16 ? '#FFF' : '#DDD';
            c.fillRect(x, y, 16, 16);
         }
      }
      CHECKERBOARD = c.canvas;
   }
   
   return CHECKERBOARD;
};



function resizeCanvasToDisplaySize(canvas, multiplier) {
   multiplier = multiplier || 1;
   multiplier = Math.max(0, multiplier);
   const width  = canvas.clientWidth  * multiplier | 0;
   const height = canvas.clientHeight * multiplier | 0;
   if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
   }
   return false;
}

/**
 * vertical preferred rect texture. compute the (width, height) given an array length and stride
 * @param {int} length - array length
 * @param {int} stride - # of pixelElement of the object's structure.
 * @return {int, int} (width, height) - data texture dimension.
 */
function computeDataTextureDim(length, stride) {
   let height = length;
   let width = Math.ceil(length / kTEXTURE.maxSize);
   if (width > 1) {
      height = Math.ceil(length / width);     // align to texture rect
   }
   
   width *= stride;
   if (width > kTEXTURE.maxSize) {
      //width = height = 0;
      throw("data texture > than MAX_TEXTURE_SIZE: " + width);
   }
   
   return [width, height];
}

function computeDataTextureConcatDim(lengthA, lengthB, stride) {
   let width = lengthA;
   const maxWidth = Math.floor(kTEXTURE.maxSize / stride);
   let height = Math.ceil(lengthA / maxWidth);
   if (height > 1) {
      width = Math.ceil(lengthA / height);   // tried to minized empty slot after the last row
   }
   
   // append using lengthA's texture rect width.
   let heightB = Math.ceil(lengthB / width);
   
   return [width, height, heightB];
}

/**
 * given an array length, compute the length that will fitted the dataTexture's rect dimension.
 * 
 */
function computeDataTextureLen(length, stride=1) {
   if (length < kTEXTURE.minLength) {
      length = kTEXTURE.minLength;
   }
   
   const [width, height] = computeDataTextureDim(length, stride);
   return (width * height);
}


let kExpandSize = 1.5;
/**
 * given the current length, give next length that align the gpu texture.
 * 
 */
function expandAllocLen(length) {
   if (length < kTEXTURE.minLength) {
      length = kTEXTURE.minLength;
   } else {
      length = Math.ceil( length * kExpandSize );
   }
   
   return computeDataTextureLen(length, 1);        // padded to texture size
}


export {
   drawQuad,
   drawTwoTri,
   makeDataTexture,
   makeDataTextureConcat,
   makeDataTexture3D,
   getCHECKERBOARD,
   defaultSampler,
   setImage,
   setWHITE,
   setConstant,
   computeDataTextureDim,
   computeDataTextureLen,
   expandAllocLen,
   createProgram,
   setUniforms,
   resizeCanvasToDisplaySize,
}

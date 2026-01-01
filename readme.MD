Catmull-Clark Subdivision Surface

texturing using Htex like. drawing using the htex, one edge, one quad face, one rect texture.

halfEdge all the way? subdivide then adaptive Concurrent Binary Tree?

bake htex pbr material into texture tile. pack into array of textures.

WHY:

texture tile? save space on uv coord(one tile per one edge). easier to go bindless.

uniform tile? simpler implementation first.

draw quad using whole edge? everything is quad/tri, less efficient but flexible. good for editing purpose.

performance is memory bound, so minimize memory usage.

TODO:

bake tiles
  continuous tiles if
   a) valence of 4 
   b) rect polygon.
  separate groups of tiles by 1 tile border to add border pixels.

  tiles group by 8x8? or as big as possible?
  box packing algorithm?

var tiles = [[],[],[]]; // declare 2d array to hold tiles
var rate = 5; ////
var fr = 30;
var maxGridWidth = 500;
// if (document.getElementById("sketch-holder").offsetWidth < maxGridWidth) {
  var tileSize = (document.getElementById("sketch-holder1")/3) - 5;
//   console.log(document.getElementById("sketch-holder").offsetWidth); // /6 because it was originally /3 but I want it half screen
// } else {
//   var tileSize = (maxGridWidth-20)/3;
//}
// define array of colors here? later on

function setup() {

  var canvas = createCanvas(tileSize*3, tileSize*3);
  // Move the canvas so it’s inside our <div id="sketch-holder">.
  canvas.parent('sketch-holder1');
  frameRate(fr);
  // creates 3x3 matrix of tiles in a not-so-elegant way :(
  for(var i=0; i<3; i++) {
    for(var j=0; j<3; j++) {
      tiles[i][j] = new tile();
    }
  }
}
// taken from Shiffman at https://github.com/processing/p5.js/issues/193
// window.onresize = function() {
//   var w = window.innerWidth;
//   if (w < maxGridWidth) {
//     resizeCanvas(w,w);
//     tileSize = (w/3) - 10;
//   }
// };


function draw() {
  stroke('#ffffff');

  for(var i=0; i<3; i++) {
    for(var j=0; j<3; j++) {
      tiles[i][j].show(i, j);
    }
  }

  //generate new tiles every 30 frames
  if (frameCount % 30 == 1) {
    for(var i=0; i<3; i++) {
      for(var j=0; j<3; j++) {
        tiles[i][j].randFace();
      }
    }
  }

  if (frameCount % 30 >= fr-rate) {
    for(var i=0; i<3; i++) {
      for(var j=0; j<3; j++) {
        tiles[i][j].update();
      }
    }
  }
}

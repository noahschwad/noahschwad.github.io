// var synth = new Tone.Synth();
// synth.toMaster();

var fr = 60;
var maxWidth = 700;
var canvasSize;
var speedFlip = {
  2 : 5,
  3 : 4,
  4 : 3,
  5 : 2
};

// variables for random notes
cPentatonic = ["A", "C", "E", "G"];

// if (window.innerWidth < maxWidth) {
//   var canvasSize = [window.innerWidth-50, window.innerWidth*.6];
// } else {
//   var canvasSize = [maxWidth, maxWidth*.6];
// }
var canvasSize = [document.getElementById("sketch-holder2").offsetWidth - 10,
                  document.getElementById("sketch-holder2").offsetWidth];

var mallet1;
var mallet2;
var mallet3;

var sliderXt = 0;

function setup() {
  var canvas = createCanvas(canvasSize[0], canvasSize[1]);
  // Move the canvas so it’s inside our <div id="sketch-holder">.
  canvas.parent('sketch-holder2');
  frameRate(fr);
  /* // song 1
  mallet1 = new mallet(32, 0, ["E3", "E3", "C3", "C3"], "16n");
  mallet2 = new mallet(16, 1, ["G4", "C4", "E4", "C4", "E4", "A4"], "16n");
  mallet3 = new mallet(64, 0, ["G5", "C5"], "8n");
  */
  // song 2
  mallet1 = new mallet(16,
                       1,
                       ["E2", "E2", "G4", "G2", "E2", "E2", "a3", "a3"],
                       "16n",
                       -10,
                       "#ffffff");
  mallet2 = new mallet(16,
                       0,
                       ["C4", "E4", "C5", "E5", "A5", "A5", "G4", "G4"],//, "B4", "A#4", "A4", "D4"],
                       "4n",
                       -15,
                       "#89AA9B");
  // mallet3 = new mallet(8,
  //                      0,
  //                      ["A1", "C1", "E1", "G1"],
  //                      "8n",
  //                      "#cc65c000");


  /*/initialize the noise and start
  var noise = new Tone.Noise("brown").start();

  //make an autofilter to shape the noise
  var autoFilter = new Tone.AutoFilter({
  	"frequency" : "4m",
  	"min" : 800,
  	"max" : 15000
  }).connect(Tone.Master);

  //connect the noise
  noise.connect(autoFilter);
  //start the autofilter LFO
  autoFilter.start()
  //*/
}

function draw() {
  background(255);
  fill("#89AA9B");
  noStroke();
  rect(0, 0, canvasSize[0]/2, canvasSize[1]);
  stroke(255);
  strokeWeight(5);

  stroke("#89AA9B");
  mallet1.show();

  stroke(255);
  mallet2.show();



  // mallet3.show();

  mallet2.randNote();
  mallet1.randNote();


}

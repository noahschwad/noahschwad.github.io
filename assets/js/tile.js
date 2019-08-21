function tile() {

  this.tileColor = [73, 129, 140];
  this.tileColorChg = [0, 0, 0];

  this.eyeTall = 25;
  this.eyeTallChg = 0;

  this.eyeWide = 25;
  this.eyeWideChg = 0;

  this.eyeAsym = 0;
  this.eyeAsymChg = 0;

  this.eyeSpacing = 45;
  this.eyeSpacingChg = 0;

  this.eyebrow = [0,0,0];
  this.eyebrowChg = [0,0,0];

  this.mouthTall = 0;
  this.mouthTallChg = 0;

  this.mouthWide = 40;
  this.mouthWideChg = 0;

  this.mouthAsym = 0;
  this.mouthAsymChg = 0;

  this.scalp = 300;
  this.scalpChg = [0,0];

  this.scalpAsym = 0;
  this.scalpAsymChg = 0;


  this.show = function(xOffset, yOffset) {
    // this function draws all the tiles and faces
    // tile
    fill(this.tileColor[0], this.tileColor[1], this.tileColor[2]);
    rect(xOffset*tileSize, yOffset*tileSize, tileSize, tileSize);
    // face
    stroke(255);
    strokeWeight(5);
    noFill();
    // head circle
    // ellipse(xOffset*200+100, yOffset*200+100, 150, 150);
    curve(xOffset*tileSize+(.5*tileSize)+this.scalp*(tileSize/200) - this.eyeAsym*(tileSize/20), yOffset*tileSize+(3.5*tileSize),
          xOffset*tileSize+(.125*tileSize), yOffset*tileSize+(.5*tileSize),
          xOffset*tileSize+(.875*tileSize), yOffset*tileSize+(.5*tileSize),
          xOffset*tileSize+(.5*tileSize)-this.scalp*(tileSize/200) - this.eyeAsym*(tileSize/20), yOffset*tileSize+(3.5*tileSize));
    curve(xOffset*tileSize+(.125*tileSize), yOffset*tileSize-(2.5*tileSize),
          xOffset*tileSize+(.125*tileSize), yOffset*tileSize+(.5*tileSize),
          xOffset*tileSize+(.875*tileSize), yOffset*tileSize+(.5*tileSize),
          xOffset*tileSize+(.875*tileSize), yOffset*tileSize-(2.5*tileSize));
    // fill(255);
    // eyes
    ellipse(xOffset*tileSize+(.5*tileSize)-this.eyeSpacing*(tileSize/200)+this.eyeAsym*(tileSize/150),
            yOffset*tileSize+(.42*tileSize),
            this.eyeWide*(tileSize/200),
            this.eyeTall*(tileSize/200));
    ellipse(xOffset*tileSize+(.5*tileSize)+this.eyeSpacing*(tileSize/200)+this.eyeAsym*(tileSize/150),
            yOffset*tileSize+(.42*tileSize),
            this.eyeWide*(tileSize/200),
            this.eyeTall*(tileSize/200));
    // eyebrows
    line( xOffset * tileSize + (.55*tileSize) - this.eyeSpacing*(tileSize/200) + this.eyeAsym*(tileSize/150),
          yOffset * tileSize + (.35*tileSize) + this.eyebrow[0]*(tileSize/200) - this.eyeTall/2*(tileSize/200) - this.eyebrow[2]*(tileSize/15),
          xOffset * tileSize + (.425*tileSize) - this.eyeSpacing*(tileSize/200) + this.eyeAsym*(tileSize/150),
          yOffset * tileSize + (.35*tileSize) + this.eyebrow[1]*(tileSize/200) - this.eyeTall/2*(tileSize/200) - this.eyebrow[2]*(tileSize/15));
    line( xOffset * tileSize + (.575*tileSize) + this.eyeSpacing*(tileSize/200) + this.eyeAsym*(tileSize/150),
          yOffset * tileSize + (.35*tileSize) + this.eyebrow[1]*(tileSize/200) - this.eyeTall/2*(tileSize/200),
          xOffset * tileSize + (.45*tileSize) + this.eyeSpacing*(tileSize/200) + this.eyeAsym*(tileSize/150),
          yOffset * tileSize + (.35*tileSize) + this.eyebrow[0]*(tileSize/200) - this.eyeTall/2*(tileSize/200));
    // mouth
    curve(xOffset * tileSize + (tileSize/2) - this.mouthWide*(tileSize/200),
          yOffset * tileSize + (this.mouthTall*(tileSize/200) + (tileSize/2)),
          xOffset * tileSize + (tileSize/2) - this.mouthWide/2*(tileSize/200),
          yOffset * tileSize + (.7*tileSize) + this.mouthTall/10*(tileSize/200),
          xOffset * tileSize + (tileSize/2) + this.mouthWide/2*(tileSize/200),
          yOffset * tileSize + (.7*tileSize) + this.mouthTall/10*(tileSize/200),
          xOffset * tileSize + (tileSize/2) + this.mouthWide*(tileSize/200),
          yOffset * tileSize + (this.mouthTall*(tileSize/200) + (tileSize/2)));
  }

  this.changeRate = function(orig, nu, rate) {
    // increments the facial attributes over 'rate' amount of frames
    orig = orig + ((nu - orig)/rate);
    return orig;

  }

  this.update = function() {

    this.eyeTall = this.changeRate(this.eyeTall, this.eyeTallChg, rate);
    this.eyeWide = this.changeRate(this.eyeWide, this.eyeWideChg, rate);
    this.eyeAsym = this.changeRate(this.eyeAsym, this.eyeAsymChg, rate);
    this.eyeSpacing = this.changeRate(this.eyeSpacing, this.eyeSpacingChg, rate);
    this.mouthTall = this.changeRate(this.mouthTall, this.mouthTallChg, rate);
    this.mouthWide = this.changeRate(this.mouthWide, this.mouthWideChg, rate);
    this.eyebrow[0] = this.changeRate(this.eyebrow[0], this.eyebrowChg[0], rate);
    this.eyebrow[1] = this.changeRate(this.eyebrow[1], this.eyebrowChg[1], rate);
    this.eyebrow[2] = this.changeRate(this.eyebrow[2], this.eyebrowChg[2], rate);
    this.scalp = this.changeRate(this.scalp, this.scalpChg, rate);


  }


  this.randFace = function() {
    this.eyeTallChg = random(0, 45);
    this.eyeWideChg = random(4, 30);
    this.eyeSpacingChg = random(15,30);
    this.eyeAsymChg    = random(-30, 30);
    this.eyebrowChg = [random(-10,10), random(-10,10), random([0, 0, 0, 1])]; // outer, inner, asym
    this.mouthTallChg = random(-350,50);
    this.mouthWideChg = random(30,80);
    this.mouthAsymChg = random(-10, 10);
    this.scalpChg = random(-200,400);
    this.scalpAsymChg = random(-10,10);
    this.tileColorChg = [random()*255, random()*255, random()*255];
  }
}

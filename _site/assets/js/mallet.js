


function mallet(spd, startBottom, notes, noteLen, volvol, color) {

  this.speed = spd;
  this.nextSpeed = spd;
  this.radius = 200 - 500/(windowWidth/100);
  this.position = [this.radius/1.6,
                   startBottom*(canvasSize[1]-this.radius/1.6) + !startBottom*this.radius/1.6];
  this.origPos = [];
  this.origPos[0] = this.position[0];
  this.origPos[1] = this.position[1];
  this.malletColor = color;
  this.count = 0;
  this.prevCount = 0; // used to fix bug where x direction would change too early
  this.direction = [1, startBottom + !startBottom*-1];
  this.trem = new Tone.Tremolo(frequency = 12,
                               depth = 1,
                               //spread = 0,
                               type = 'square').start();
  //this.crusher.wet.value = 0;
  this.vol = new Tone.Volume( [volume = volvol] );




  this.notes = notes;
  this.noteLen = noteLen;
  this.noteChg = [];
  for (i = 0; i < this.notes.length; i++) {
    this.noteChg[i] = 0;
  }
  this.sizeTrack = 0;
  this.audioStarted = false;


  this.show = function() {

    if (frameCount % (this.speed) == 0) {
      this.direction[1] *= -1;
      this.count += 1;
      this.sizeTrack += 1;
      if (this.audioStarted) {
        this.synth.triggerAttackRelease(this.notes[this.count%notes.length], noteLen);
      }
      // size change effects
      if ((this.sizeTrack % 32) < 16) {
        this.radius += (canvasSize[0] / 100);
        this.vol.volume.value += .5;
        //this.trem.wet.value += .06;
      }
      else {
        this.radius -= (canvasSize[0] / 100);
        this.vol.volume.value -= .5;
        //this.trem.wet.value -= .06;
      }
    }

    if ((frameCount-this.prevCount) % (this.speed*this.notes.length/2) == 0) {
      this.direction[0] *= -1;
      this.prevCount = frameCount;
    }

    if (this.count == this.notes.length) {

      this.speed = this.nextSpeed;
      this.count = 0;
      // this.position[0] = this.origPos[0];
      // this.position[1] = this.origPos[1];
      // console.log(this.position);
      // console.log("orig",this.origPos);

    }

    this.position[1] -= (canvasSize[1]-this.radius) *
      this.direction[1]/(1.05*this.speed);
    this.position[0] += (canvasSize[0]-this.radius) *
      this.direction[0]/(this.speed*this.notes.length/2) * .95 ;

    fill(this.malletColor);
    ellipse(this.position[0], this.position[1], this.radius, this.radius);

  }


  this.randNote = function() {
    if (frameCount % (this.speed*this.notes.length) == 0) {
      for (i = 0; i < this.notes.length; i++) {
        if (Math.random() > .33) {
          index = Math.floor(Math.random() * cPentatonic.length);
          nunote = cPentatonic[index];
          this.notes[i] = nunote + notes[i].substr(this.notes[i].length - 1);
          this.noteChg[i] = this.speed/2;
          //
          // FOR IF NOTES ARE FREQUENCIES RATHER THAN WESTERN SCALE
          //
          // if (i < this.notes.length/4 || i >= (this.notes.length/4)*3) {
          //   this.notes[i] = (Math.abs(this.notes[i] + Math.floor((Math.random() * 200)-400))) % 400 + 75;
          // }
          // else {
          //   this.notes[i] = (Math.abs(this.notes[i] + Math.floor((Math.random() * 200)-400))) % 600 + 475;
          // }
        }
      }

      // if (this.gen_mute == false) {
      //   var msg = new SpeechSynthesisUtterance('Papa');
      //   window.speechSynthesis.speak(msg);
      // }
    }
  }

  this.crusherChange = function(crsh) {
    if (crsh > 8) {this.crusher.wet.value = 0;}
    else {
      this.crusher.wet.value = 1;
      this.crusher.bits = crsh;
      //this.vol.volume = (-30 * crsh);

      }
  }

  this.detuneChange = function(dtn) {
    this.synth.detune.value = dtn;
  }

  this.speedChange = function(nuSpeed) {
    this.nextSpeed = Math.pow(2, speedFlip[nuSpeed]);
  }

  this.start = function() {
    this.audioStarted = true;
    this.synth = new Tone.Synth();
    this.synth.chain(this.vol, Tone.Master);
    this.trem.spread = 0;
    this.synth.oscillator.type = "sine2";
    // document.getElementById("starter").onclick = "javascript: Tone.Master.mute ^= true;";
    // console.log(document.getElementById("starter").onclick, "hi");
    // document.getElementById("starter").value = "Mute";
    //this.synth.oscillator.partials = [1, 1, 4];

  }

}

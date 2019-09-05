var active = 1;
var numSwitches = 0;

scripts = [ ['assets/js/sketch1.js', 'assets/js/tile.js'],
            [/*'assets/js/Tone.js',*/ 'assets/js/sketch2.js', 'assets/js/mallet.js'] ];




function activateOther() {

  remove();

  for (i=0; i < scripts[active % 2].length; i++) {
    $.getScript(scripts[active][i]);
  }

  $.getScript('https://cdnjs.cloudflare.com/ajax/libs/p5.js/0.6.0/p5.js');

  if (active == 0) {  // switching to smiles
    Tone.Master.dispose();
    resetSynthButton();
    console.log('reset synth button!');
    document.getElementById('controls').style.visibility = "hidden";
  }

  if (active == 1) {  // switching to synth
    document.getElementById('controls').style.visibility = "visible";
    if (numSwitches > 1) {setTimeout(function() {Tone.Master.mute = true; console.log(Tone.Master.mute);}, 500);}

    //Tone.Master.mute = false;

    //resetSynthButton();
  }
  //ocument.getElementById('starter').setAttribute('onclick','resetSynthButton()');
  document.getElementById('sketch-holder1').style.height = (tileSize * 3)+12;

  numSwitches += 1;
  active = 1 - active;
}

function resetSynthButton() {

  document.getElementById('starter').setAttribute("onclick","Tone.Master.mute ^= true; this.setAttribute('value','Mute'); mallet1.start(); mallet2.start();");

  document.getElementById('starter').setAttribute("value","Start");
}

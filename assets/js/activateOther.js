var active = 1;

scripts = [ ['assets/js/sketch1.js', 'assets/js/tile.js'],
            ['assets/js/Tone.js', 'assets/js/sketch2.js', 'assets/js/mallet.js'] ];




function activateOther() {

  remove();

  for (i=0; i < scripts[active % 2].length; i++) {
    $.getScript(scripts[active][i]);
  }

  $.getScript('https://cdnjs.cloudflare.com/ajax/libs/p5.js/0.6.0/p5.js');
  active = 1 - active;


  document.getElementById('starter').setAttribute('onclick','resetSynthButton()');

  document.getElementById('sketch-holder1').style.height = (tileSize * 3)+12;

}

function resetSynthButton() {
  mallet1.start();
  mallet2.start();
  document.getElementById('starter').setAttribute("onclick","Tone.Master.mute ^= true;");
  document.getElementById('starter').setAttribute("value","Mute");
}

/* Toggle between adding and removing the "responsive" class to topnav when the user clicks on the icon */
function myFunction() {
  var x = document.getElementById("myTopnav");
  if (x.className === "topnav") {
    x.className += " responsive";
  } else {
    x.className = "topnav";
  }
}

function linkActive() {
  var y = document.getElementById("myTopnav");
  var btns = y.getElementsByTagName("a");
  for (i=0; i++; i<btns.length) {
    if (window.location.pathname.includes);
  }
  //('div a[href^="/' + location.pathname.split("/")[1] + '"]').addClass('active');
}

document.write('\
\
  <header>\
    <h1 style="float: left;">  NoahDesigns4u.com</h1>\
    <!-- Load an icon library to show a hamburger menu (bars) on small screens -->\
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">\
\
    <div class="topnav" id="myTopnav">\
      <a href="contact.html">Contact</a>\
      <a href="about.html">About</a>\
      <a href="home.html">Home</a>\
      <a href="javascript:void(0);" class="icon" onclick="myFunction()">\
        <i class="fa fa-bars"></i>\
      </a>\
    </div>\
  </header>\
  <br>\
\
');

linkActive();

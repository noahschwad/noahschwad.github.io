


function hideMenu(event) {

  var menu = document.getElementsByTagName('ul')[0]

  if (menu.classList.contains("active")
      && event.target.id != "menu-icon"
      && event.target.id != "navList"
      && event.target.tagName != "LI" ) {
    menu.classList.toggle("active");
    removeEventListener("click", hideMenu);
    menuOpen = false;
  }
}


async function menuButton() {

  var menu = document.getElementsByTagName('ul')[0]

  if (menu.classList.contains("active")) {
    menu.classList.toggle("active");

    removeEventListener("click", hideMenu);
    await sleep(300);
    menu.style.display = "none";
    menuOpen = false;
  }
  else {
    menu.style.display = "flex";
    await sleep(50);
    // console.log("flex");
    menu.classList.toggle("active");
    menuOpen = true;
    // console.log('activated');
    addEventListener("click", hideMenu);
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}



// window.onscroll = function() {scrollMenuHide()};

window.addEventListener('scroll', scrollMenuHide);


var lastScroll = [];
// var lastScroll2 = [];

var menuOpen = false;

function scrollMenuHide () {

  var menu = document.getElementsByTagName('ul')[0]

  if (menuOpen == true) {
    lastScroll.push(document.body.scrollTop);
    // lastScroll2.push(document.documentElement.scrollTop);

    if ( (document.body.scrollTop-100) > Math.min.apply(Math, lastScroll)
         || (document.body.scrollTop+100) < Math.max.apply(Math, lastScroll) ) {
           menu.classList.toggle("active");
           menuOpen = false;
           lastScroll = [];
         }
    // else if ( (document.documentElement.scrollTop-80) > Math.max.apply(Math, lastScroll2)
    //      || (document.documentElement.scrollTop+80) < Math.min.apply(Math, lastScroll2) ) {
    //        menu.classList.toggle("active");
    //        menuOpen = false;
    //      }
  }
}








var a = 1;

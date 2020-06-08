


function hideMenu(event) {

  var menu = document.getElementsByTagName('ul')[0]


  // console.log(event.target.tagName);


  if (menu.classList.contains("active")
      && event.target.id != "menu-icon"
      && event.target.id != "navList"
      && event.target.tagName != "LI" ) {
    menu.classList.toggle("active");
    removeEventListener("click", hideMenu);
    // console.log('menu hidden');

  }

}


function menuButton() {

  var menu = document.getElementsByTagName('ul')[0]

  if (menu.classList.contains("active")) {
    menu.classList.toggle("active");
    // console.log('deactivated');
    removeEventListener("click", hideMenu);
  }

  else {
    menu.classList.toggle("active");
    // console.log('activated');
    addEventListener("click", hideMenu);
  }
}


// window.onload = function() {
//   var hidediv = document.getElementsByTagName("ul")[0];
//   document.onclick = function(div) {
//     if(div.target.tag !== 'ul' && hide.classList.contains("active")) {
//       hidediv.classList.toggle("active");
//       console.log("weird code fired")
//     }
//   };
// };

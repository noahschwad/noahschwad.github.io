


function hideMenu(event) {

  var menu = document.getElementsByTagName('ul')[0]

  if (menu.classList.contains("active")
      && event.target.id != "menu-icon"
      && event.target.id != "navList"
      && event.target.tagName != "LI" ) {
    menu.classList.toggle("active");
    removeEventListener("click", hideMenu);

  }

}


async function menuButton() {

  var menu = document.getElementsByTagName('ul')[0]

  if (menu.classList.contains("active")) {
    menu.classList.toggle("active");

    // console.log('deactivated');
    removeEventListener("click", hideMenu);

    await sleep(300);

    menu.style.display = "none";

  }

  else {
    menu.style.display = "flex";
    await sleep(50);
    console.log("flex");
    menu.classList.toggle("active");
    // console.log('activated');
    addEventListener("click", hideMenu);
  }
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

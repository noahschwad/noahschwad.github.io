// header isnt fixed by default
document.getElementById("headerBox").style.position = "fixed";
document.getElementsByTagName("header")[0].style.position = "fixed";


scrollFunction();

window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > 30 || document.documentElement.scrollTop > 30) {

    document.getElementById("headerBox").classList.add("fullHeddrBox");
    document.getElementsByTagName("header")[0].style.top = "0px";
    document.getElementsByTagName("header")[0].style.height = "60px";
    document.getElementsByTagName("ul")[0].style.right = "-5px";



  } else {

    document.getElementById("headerBox").classList.remove("fullHeddrBox");
    document.getElementsByTagName("header")[0].style.top = "25px";
    document.getElementsByTagName("header")[0].style.height = "70px";
    document.getElementsByTagName("ul")[0].style.right = "13px";




  }
}

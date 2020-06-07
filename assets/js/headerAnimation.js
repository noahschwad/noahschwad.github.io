// header isnt fixed by default
document.getElementById("headerBox").style.position = "fixed";
document.getElementsByTagName("header")[0].style.position = "fixed";


window.onscroll = function() {scrollFunction()};

function scrollFunction() {
  if (document.body.scrollTop > 30 || document.documentElement.scrollTop > 30) {

    document.getElementById("headerBox").classList.add("fullHeddrBox");
    document.getElementsByTagName("header")[0].style.top = "0px";
    document.getElementsByTagName("header")[0].style.height = "50px";


  } else {

    document.getElementById("headerBox").classList.remove("fullHeddrBox");
    document.getElementsByTagName("header")[0].style.top = "25px";
    document.getElementsByTagName("header")[0].style.height = "70px";



  }
}

$(document).ready(function(){
  $('.carousel').slick({dots: true, arrows: true, slidesToShow: 1,
    responsive: [{
      breakpoint: 740,
      settings: {
        dots: true, arrows: false, slidesToShow: 1, speed: 200
      }
    }]
  });
});

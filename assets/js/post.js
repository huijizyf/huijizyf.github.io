$(document).ready(function() {
    categoryDisplay();
});

function categoryDisplay() {
    $('.post-list-body>div[post-cate!=All]').hide();
    $('.categories-list-item').click(function() {
        var cate = $(this).attr('cate'); //get category's name

        $('.post').hide();

        $('.post-list-body>div[post-cate!=' + cate + ']').hide(250);
        $('.post-list-body>div[post-cate=' + cate + ']').show(400);
    });
}
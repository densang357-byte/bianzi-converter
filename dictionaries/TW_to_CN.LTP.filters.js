"use strict";

function 修正引号(configuration) {
    const {converted_text: converted_text} = configuration;
    converted_text.forEach((text, index) => {
        converted_text[index] = text.replace(/「/g, "“").replace(/」/g, "”").replace(/『/g, "‘").replace(/』/g, "’");
    });
}

module.exports = {
    "修正引号": 修正引号
};

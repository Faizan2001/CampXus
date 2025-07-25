// Mock spa-init.js and app.js to avoid CSS imports during testing
import { jest } from '@jest/globals';

export const navigateTo = jest.fn();
export const loadPageContent = jest.fn();
export const currentPage = 'home';
export const setupProfileCompletionFlow = jest.fn();
export const updatePageTitle = jest.fn();